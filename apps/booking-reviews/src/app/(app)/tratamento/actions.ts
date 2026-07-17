"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@praxis/core";
import { requireRole, requireSession } from "@/lib/auth";
import { uploadToCloudinary, deleteFromCloudinary } from "@/lib/cloudinary";
import { addBusinessDays, normalizeToFiveStars } from "@/lib/scoring";
import { collectNewAirbnbReviews } from "@/lib/airbnbCollector";
import { logAlert } from "@/lib/alerts";
import { safeAction } from "@/lib/safeAction";

// Portado de apps/booking-reviews/src/app/(app)/tratamento/actions.ts (v1).
// Mudanças estruturais (além de companyId→tenantId / session.name→session.nome):
//   - `findOrCreateProperty` virou `findPropertyByNome`: só BUSCA uma
//     Property já cadastrada (comparação sem diferenciar maiúsculas/
//     minúsculas), NUNCA cria uma nova — Property é cadastro centralizado no
//     gateway, igual UH (ver model Property no schema). Quando não encontra,
//     a avaliação vira PendingAirbnbImport igual ao caso de "e-mail não
//     trouxe nome nenhum".
//   - `company.airbnbLastCollectedAt` virou `ReviewsConfig.airbnbLastCollectedAt`
//     (tenantId-keyed), já que não existe mais model Company.
//   - `AIRBNB_INTEGRATION_COMPANY_ID` virou `AIRBNB_INTEGRATION_TENANT_ID`
//     (comparado contra session.tenantId).
//   - IMPORTANTE (descoberto rodando a coleta real em produção):
//     Review.propertyId aponta pra Property (agrupamento de UHs, ex: "Bnb
//     Flex Suites"), NÃO pra UH — Booking/Airbnb só informam a propriedade/
//     anúncio na notificação, nunca a UH específica onde o hóspede ficou.
//     Uma passada anterior desta migração tinha ligado a UH diretamente
//     (uhId) — corrigida aqui pra propertyId, com `updateReviewPropertyAction`
//     mantendo o mesmo nome do v1 (fazia sentido nele, faz sentido de novo).

const FINAL_THRESHOLD = 4.75; // nota (normalizada 0-5) a partir da qual pode ir direto p/ Finalizadas
const MAX_ATTACHMENT_BYTES = 4.5 * 1024 * 1024; // limite de body do Vercel (Hobby) pra Server Actions

const STAGE_LABEL: Record<string, string> = {
  RECEBIDA: "Avaliação Recebida",
  ANALISE_PLANEJAMENTO: "Análise & Planejamento",
  EXECUCAO: "Execução",
  AVALIACAO_EFICACIA: "Avaliação da Eficácia",
  FINALIZADA: "Finalizadas",
};

// Usado pela coleta automática do Airbnb: o nome da propriedade vem do corpo
// do e-mail (parseAirbnbBody). Busca apenas — nunca cria uma Property nova.
// Se não achar nenhuma Property com esse nome, quem chamou deve tratar como
// pendência manual (ver runAirbnbCollectionAction).
async function findPropertyByNome(tenantId: string, nome: string): Promise<string | null> {
  const existing = await prisma.property.findFirst({
    where: { tenantId, nome: { equals: nome, mode: "insensitive" } },
  });
  return existing?.id ?? null;
}

// Log automático da história de tratativa do card (ReviewLog) — visível a
// qualquer papel na tela de Tratamento, junto com as observações
// gerenciais. Não confundir com Alert (que é sobre notificar gente); isso
// aqui é o registro permanente de "o que aconteceu com esse card".
async function logReviewEvent(
  reviewId: string,
  actorId: string,
  action: string,
  detail?: string
) {
  await prisma.reviewLog.create({
    data: { reviewId, actorId, action, detail: detail ?? null },
  });
}

// Exclui o card definitivamente (avaliação + tudo que dependia dela: notas de
// atendente, categorias, plano de ação, checks de eficácia e observações
// gerenciais — tudo em cascata no schema). Não tem volta, por isso é
// restrito a Master/Gerente e sempre avisa os dois.
async function deleteReviewActionImpl(reviewId: string) {
  const session = await requireRole("GERENTE", "MASTER");
  const review = await prisma.review.findFirstOrThrow({
    where: { id: reviewId, tenantId: session.tenantId },
  });

  const attachments = await prisma.reviewAttachment.findMany({
    where: { reviewId: review.id },
    select: { fileUrl: true },
  });
  await Promise.all(attachments.map((a) => deleteFromCloudinary(a.fileUrl)));

  await prisma.review.delete({ where: { id: review.id } });

  await logAlert({
    tenantId: session.tenantId,
    type: "CARD_EXCLUIDO",
    message: `${session.nome} excluiu a avaliação de ${review.guestName} (nota ${review.ratingNormalized.toFixed(
      2
    )}, ${review.platform}) — estava em "${STAGE_LABEL[review.stage]}". Essa ação não pode ser desfeita.`,
    targetUserIds: [],
  });

  revalidatePath("/tratamento");
  revalidatePath("/dashboard");
  revalidatePath("/compromissos");
  revalidatePath("/desempenho");
}

async function startAnalysisActionImpl(reviewId: string) {
  const session = await requireRole("GERENTE", "MASTER");
  const review = await prisma.review.findFirstOrThrow({
    where: { id: reviewId, tenantId: session.tenantId },
  });

  await prisma.review.update({
    where: { id: review.id },
    data: {
      stage: "ANALISE_PLANEJAMENTO",
      analyzedById: session.userId,
    },
  });

  await logReviewEvent(review.id, session.userId, "ANALISE_INICIADA", "Análise & Planejamento iniciada.");

  revalidatePath("/tratamento");
}

async function moveDirectToFinalActionImpl(reviewId: string) {
  const session = await requireRole("GERENTE", "MASTER");
  const review = await prisma.review.findFirstOrThrow({
    where: { id: reviewId, tenantId: session.tenantId },
  });

  if (review.ratingNormalized < FINAL_THRESHOLD) {
    throw new Error("Somente avaliações com nota máxima podem ir direto para Finalizadas.");
  }

  await prisma.review.update({
    where: { id: review.id },
    data: { stage: "FINALIZADA", skippedToFinal: true },
  });

  await logReviewEvent(
    review.id,
    session.userId,
    "FINALIZADA_AUTOMATICA",
    "Nota máxima — movida direto de Avaliação Recebida para Finalizadas."
  );

  await logAlert({
    tenantId: session.tenantId,
    type: "CARD_FINALIZADO",
    message: `Avaliação de ${review.guestName} (nota ${review.ratingNormalized.toFixed(2)}) finalizada automaticamente (nota máxima).`,
    targetUserIds: [],
    reviewId: review.id,
  });

  revalidatePath("/tratamento");
}

export type SaveAnalysisInput = {
  reviewId: string;
  attendants: { attendantId: string; score: number; observation: string }[];
  categoryIds: string[];
  actionItems: { description: string; dueDate: string }[];
  efficacyPlans: { scheduledDate: string; description: string }[];
};

async function saveAnalysisActionImpl(input: SaveAnalysisInput) {
  const session = await requireRole("GERENTE", "MASTER");

  if (input.attendants.length === 0) {
    throw new Error("Selecione ao menos uma atendente e informe a nota/observação.");
  }
  if (input.attendants.some((a) => !a.observation?.trim())) {
    throw new Error("Observação é obrigatória para cada atendente avaliada.");
  }
  if (input.actionItems.length === 0) {
    throw new Error("Inclua ao menos uma ação no plano de ação.");
  }
  // Não dá pra mandar o card pra Execução sem um plano de avaliação de
  // eficácia elaborado — cada data precisa ser adicionada manualmente pelo
  // Gerente/Master, com uma descrição do que será analisado nela.
  if (input.efficacyPlans.length === 0) {
    throw new Error("Inclua ao menos uma avaliação de eficácia planejada.");
  }
  if (input.efficacyPlans.some((e) => !e.scheduledDate)) {
    throw new Error("Informe a data de cada avaliação de eficácia planejada.");
  }
  if (input.efficacyPlans.some((e) => !e.description?.trim())) {
    throw new Error("Descreva o que será analisado em cada avaliação de eficácia.");
  }

  const review = await prisma.review.findFirstOrThrow({
    where: { id: input.reviewId, tenantId: session.tenantId },
  });

  await prisma.$transaction(async (tx) => {
    await tx.reviewAttendant.deleteMany({ where: { reviewId: review.id } });
    await tx.reviewAttendant.createMany({
      data: input.attendants.map((a) => ({
        reviewId: review.id,
        attendantId: a.attendantId,
        score: a.score,
        observation: a.observation,
      })),
    });

    await tx.reviewCategory.deleteMany({ where: { reviewId: review.id } });
    await tx.reviewCategory.createMany({
      data: input.categoryIds.map((categoryId) => ({
        reviewId: review.id,
        categoryId,
      })),
    });

    await tx.actionPlan.deleteMany({ where: { reviewId: review.id } });
    await tx.actionPlan.create({
      data: {
        reviewId: review.id,
        items: {
          create: input.actionItems.map((item) => ({
            description: item.description,
            dueDate: new Date(item.dueDate),
          })),
        },
      },
    });

    await tx.efficacyCheck.deleteMany({ where: { reviewId: review.id } });
    await tx.efficacyCheck.createMany({
      data: input.efficacyPlans.map((e) => ({
        reviewId: review.id,
        scheduledDate: new Date(e.scheduledDate),
        description: e.description,
      })),
    });

    await tx.review.update({
      where: { id: review.id },
      data: {
        stage: "EXECUCAO",
        analysisCompletedAt: new Date(),
      },
    });
  });

  await logReviewEvent(
    review.id,
    session.userId,
    "ANALISE_CONCLUIDA",
    "Análise & Planejamento concluído — card seguiu para Execução."
  );

  // Card passou pra Execução: todo mundo do tenant recebe (não só Master/Gerente).
  const everyone = await prisma.user.findMany({
    where: { tenantId: session.tenantId, ativo: true },
    select: { id: true },
  });

  await logAlert({
    tenantId: session.tenantId,
    type: "ANALISE_PLANEJAMENTO_CONCLUIDA",
    message: `Análise & Planejamento concluído para a avaliação de ${review.guestName} (nota ${review.ratingNormalized.toFixed(2)}). Card seguiu para Execução.`,
    targetUserIds: everyone.map((u) => u.id),
    reviewId: review.id,
  });

  // Cada atendente avaliada recebe, individualmente, a nota/observação que
  // ela levou nessa avaliação de atendimento.
  await Promise.all(
    input.attendants.map((a) =>
      logAlert({
        tenantId: session.tenantId,
        type: "AVALIACAO_ATENDIMENTO_RECEBIDA",
        message: `Você recebeu uma avaliação de atendimento na avaliação de ${review.guestName} (nota ${review.ratingNormalized.toFixed(
          2
        )}): sua nota foi ${a.score.toFixed(1)}/5. Observação: ${a.observation}`,
        targetUserIds: [a.attendantId],
        reviewId: review.id,
      })
    )
  );

  revalidatePath("/tratamento");
}

// Salva o progresso da Análise & Planejamento sem exigir os requisitos
// completos e sem mudar o estágio do card — usado tanto pelo botão "Salvar
// rascunho" quanto automaticamente ao fechar o card, pra ninguém perder
// trabalho já feito (atendentes selecionadas, categorias, ações, datas de
// eficácia) só porque clicou fora da janela antes de concluir.
async function saveAnalysisDraftActionImpl(input: SaveAnalysisInput) {
  const session = await requireRole("GERENTE", "MASTER");

  const review = await prisma.review.findFirstOrThrow({
    where: { id: input.reviewId, tenantId: session.tenantId },
  });

  // Só faz sentido guardar rascunho enquanto o card está mesmo em Análise &
  // Planejamento — depois disso o fluxo normal (Execução/Eficácia) manda.
  if (review.stage !== "ANALISE_PLANEJAMENTO") return;

  const cleanActionItems = input.actionItems.filter((i) => i.description?.trim());
  const cleanEfficacyPlans = input.efficacyPlans.filter((e) => !!e.scheduledDate);

  await prisma.$transaction(async (tx) => {
    await tx.reviewAttendant.deleteMany({ where: { reviewId: review.id } });
    if (input.attendants.length > 0) {
      await tx.reviewAttendant.createMany({
        data: input.attendants.map((a) => ({
          reviewId: review.id,
          attendantId: a.attendantId,
          score: a.score,
          observation: a.observation ?? "",
        })),
      });
    }

    await tx.reviewCategory.deleteMany({ where: { reviewId: review.id } });
    if (input.categoryIds.length > 0) {
      await tx.reviewCategory.createMany({
        data: input.categoryIds.map((categoryId) => ({ reviewId: review.id, categoryId })),
      });
    }

    await tx.actionPlan.deleteMany({ where: { reviewId: review.id } });
    if (cleanActionItems.length > 0) {
      await tx.actionPlan.create({
        data: {
          reviewId: review.id,
          items: {
            create: cleanActionItems.map((item) => ({
              description: item.description,
              dueDate: new Date(item.dueDate),
            })),
          },
        },
      });
    }

    await tx.efficacyCheck.deleteMany({ where: { reviewId: review.id } });
    if (cleanEfficacyPlans.length > 0) {
      await tx.efficacyCheck.createMany({
        data: cleanEfficacyPlans.map((e) => ({
          reviewId: review.id,
          scheduledDate: new Date(e.scheduledDate),
          description: e.description ?? "",
        })),
      });
    }
  });

  revalidatePath("/tratamento");
}

export type FinalizeFiveStarInput = {
  reviewId: string;
  attendants: { attendantId: string; score: number; observation: string }[];
};

// Avaliações com nota máxima (>= FINAL_THRESHOLD) que ainda assim entraram em
// Análise & Planejamento (em vez de usar o atalho "mover direto para
// Finalizadas" na Avaliação Recebida) não precisam do processo completo —
// categorização, plano de ação e plano de eficácia continuam sem sentido
// pra uma nota máxima. Só a avaliação de atendimento é exigida; ao concluir,
// o card já vai direto para Finalizadas.
async function finalizeFiveStarAnalysisActionImpl(input: FinalizeFiveStarInput) {
  const session = await requireRole("GERENTE", "MASTER");

  const review = await prisma.review.findFirstOrThrow({
    where: { id: input.reviewId, tenantId: session.tenantId },
  });

  if (review.ratingNormalized < FINAL_THRESHOLD) {
    throw new Error("Esse atalho é só para avaliações com nota máxima.");
  }
  if (input.attendants.length === 0) {
    throw new Error("Selecione ao menos uma atendente e informe a nota/observação.");
  }
  if (input.attendants.some((a) => !a.observation?.trim())) {
    throw new Error("Observação é obrigatória para cada atendente avaliada.");
  }

  await prisma.$transaction([
    prisma.reviewAttendant.deleteMany({ where: { reviewId: review.id } }),
    prisma.reviewAttendant.createMany({
      data: input.attendants.map((a) => ({
        reviewId: review.id,
        attendantId: a.attendantId,
        score: a.score,
        observation: a.observation,
      })),
    }),
    prisma.review.update({
      where: { id: review.id },
      data: { stage: "FINALIZADA", analysisCompletedAt: new Date(), analyzedById: session.userId },
    }),
  ]);

  await logReviewEvent(
    review.id,
    session.userId,
    "FINALIZADA_NOTA_MAXIMA",
    "Nota máxima — finalizada direto após a avaliação de atendimento (sem plano de ação/eficácia)."
  );

  await Promise.all(
    input.attendants.map((a) =>
      logAlert({
        tenantId: session.tenantId,
        type: "AVALIACAO_ATENDIMENTO_RECEBIDA",
        message: `Você recebeu uma avaliação de atendimento na avaliação de ${review.guestName} (nota ${review.ratingNormalized.toFixed(
          2
        )}): sua nota foi ${a.score.toFixed(1)}/5. Observação: ${a.observation}`,
        targetUserIds: [a.attendantId],
        reviewId: review.id,
      })
    )
  );

  await logAlert({
    tenantId: session.tenantId,
    type: "CARD_FINALIZADO",
    message: `Avaliação de ${review.guestName} (nota ${review.ratingNormalized.toFixed(2)}) finalizada — nota máxima, só precisou da avaliação de atendimento.`,
    targetUserIds: [],
    reviewId: review.id,
  });

  revalidatePath("/tratamento");
  revalidatePath("/dashboard");
  revalidatePath("/desempenho");
}

// Volta um card de Execução OU Avaliação da Eficácia para Análise &
// Planejamento, pra permitir editar o plano (atendentes, categorias, ações,
// datas de eficácia). Os dados já preenchidos continuam lá — a tela de
// Análise & Planejamento pré-carrega o que existir no card. Gerente e Master
// podem fazer isso diretamente, sem precisar de aprovação de mais ninguém.
async function reopenAnalysisActionImpl(reviewId: string) {
  const session = await requireRole("GERENTE", "MASTER");
  const review = await prisma.review.findFirstOrThrow({
    where: { id: reviewId, tenantId: session.tenantId },
  });

  if (review.stage !== "EXECUCAO" && review.stage !== "AVALIACAO_EFICACIA") {
    throw new Error(
      "Só é possível editar o planejamento de cards que estão em Execução ou Avaliação da Eficácia."
    );
  }

  const fromLabel = STAGE_LABEL[review.stage];

  await prisma.review.update({
    where: { id: review.id },
    data: { stage: "ANALISE_PLANEJAMENTO" },
  });

  await logReviewEvent(
    review.id,
    session.userId,
    "PLANEJAMENTO_REABERTO",
    `Reaberto para edição — voltou de ${fromLabel} para Análise & Planejamento.`
  );

  await logAlert({
    tenantId: session.tenantId,
    type: "PLANEJAMENTO_REABERTO",
    message: `Planejamento reaberto para edição na avaliação de ${review.guestName} (nota ${review.ratingNormalized.toFixed(2)}) — voltou de ${fromLabel} para Análise & Planejamento.`,
    targetUserIds: [],
    reviewId: review.id,
  });

  revalidatePath("/tratamento");
}

// Master rejeita o planejamento elaborado pelo Gerente (não está satisfeito
// com o plano de ação/eficácia) — diferente do "Editar planejamento" acima,
// aqui é obrigatório justificar. Pode ser feito a partir de Execução,
// Avaliação da Eficácia ou até Finalizadas. A justificativa vira uma
// observação gerencial (visível no card) e um alerta pro Gerente responsável
// pela análise, além de entrar no log do card. O plano em si (atendentes,
// categorias, ações, eficácia) não é apagado — fica lá pra edição.
async function rejectPlanningActionImpl(reviewId: string, reason: string) {
  const session = await requireRole("MASTER");

  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw new Error("Informe o motivo da rejeição.");

  const review = await prisma.review.findFirstOrThrow({
    where: { id: reviewId, tenantId: session.tenantId },
  });

  if (!["EXECUCAO", "AVALIACAO_EFICACIA", "FINALIZADA"].includes(review.stage)) {
    throw new Error(
      "Só é possível rejeitar o planejamento de cards em Execução, Avaliação da Eficácia ou Finalizadas."
    );
  }

  const fromLabel = STAGE_LABEL[review.stage];

  await prisma.$transaction([
    prisma.review.update({
      where: { id: review.id },
      data: { stage: "ANALISE_PLANEJAMENTO" },
    }),
    prisma.managerialNote.create({
      data: {
        reviewId: review.id,
        authorId: session.userId,
        text: `⛔ Planejamento rejeitado por ${session.nome} (estava em "${fromLabel}"): ${trimmedReason}`,
      },
    }),
  ]);

  await logReviewEvent(
    review.id,
    session.userId,
    "PLANEJAMENTO_REJEITADO",
    `Rejeitado a partir de "${fromLabel}". Motivo: ${trimmedReason}`
  );

  const masters = await prisma.user.findMany({
    where: { tenantId: session.tenantId, role: "MASTER", ativo: true },
    select: { id: true },
  });
  const targetUserIds = Array.from(
    new Set([...(review.analyzedById ? [review.analyzedById] : []), ...masters.map((m) => m.id)])
  );

  await logAlert({
    tenantId: session.tenantId,
    type: "PLANEJAMENTO_REJEITADO",
    message: `${session.nome} rejeitou o planejamento da avaliação de ${review.guestName} (nota ${review.ratingNormalized.toFixed(
      2
    )}) — estava em "${fromLabel}". Motivo: ${trimmedReason}`,
    targetUserIds,
    reviewId: review.id,
  });

  revalidatePath("/tratamento");
  revalidatePath("/compromissos");
}

async function toggleActionItemActionImpl(itemId: string, completed: boolean) {
  const session = await requireRole("GERENTE", "MASTER");

  const item = await prisma.actionItem.findFirstOrThrow({
    where: { id: itemId },
    include: { actionPlan: { include: { review: true } } },
  });
  if (item.actionPlan.review.tenantId !== session.tenantId) {
    throw new Error("FORBIDDEN");
  }

  await prisma.actionItem.update({
    where: { id: itemId },
    data: {
      completedAt: completed ? new Date() : null,
      completedById: completed ? session.userId : null,
    },
  });

  revalidatePath("/tratamento");
}

async function completeExecutionActionImpl(reviewId: string) {
  const session = await requireRole("GERENTE", "MASTER");
  const review = await prisma.review.findFirstOrThrow({
    where: { id: reviewId, tenantId: session.tenantId },
    include: { actionPlan: { include: { items: true } } },
  });

  const items = review.actionPlan?.items ?? [];
  if (items.length === 0 || items.some((i) => !i.completedAt)) {
    throw new Error("Todas as ações do plano precisam estar concluídas.");
  }

  await prisma.review.update({
    where: { id: review.id },
    data: { stage: "AVALIACAO_EFICACIA" },
  });

  await logReviewEvent(
    review.id,
    session.userId,
    "EXECUCAO_CONCLUIDA",
    "Plano de ação executado — card seguiu para Avaliação da Eficácia."
  );

  await logAlert({
    tenantId: session.tenantId,
    type: "EXECUCAO_CONCLUIDA",
    message: `Plano de ação executado para a avaliação de ${review.guestName} (nota ${review.ratingNormalized.toFixed(2)}). Aguardando avaliação de eficácia.`,
    targetUserIds: [],
    reviewId: review.id,
  });

  revalidatePath("/tratamento");
}

async function recordEfficacyActionImpl(
  checkId: string,
  wasEffective: boolean,
  notes: string
) {
  const session = await requireRole("GERENTE", "MASTER");
  const check = await prisma.efficacyCheck.findFirstOrThrow({
    where: { id: checkId },
    include: { review: true },
  });
  if (check.review.tenantId !== session.tenantId) throw new Error("FORBIDDEN");

  await prisma.efficacyCheck.update({
    where: { id: checkId },
    data: { completedAt: new Date(), wasEffective, notes },
  });

  revalidatePath("/tratamento");
}

// Inclui uma nova avaliação de eficácia planejada num card que já está em
// Execução ou Avaliação da Eficácia (na Análise & Planejamento isso é feito
// via saveAnalysisAction/saveAnalysisDraftAction, que substituem a lista
// inteira de uma vez). Gerente e Master podem adicionar quantas quiserem.
async function addEfficacyCheckActionImpl(
  reviewId: string,
  scheduledDate: string,
  description: string
) {
  const session = await requireRole("GERENTE", "MASTER");
  const review = await prisma.review.findFirstOrThrow({
    where: { id: reviewId, tenantId: session.tenantId },
  });

  if (!scheduledDate) throw new Error("Informe a data da avaliação de eficácia.");
  if (!description?.trim()) throw new Error("Descreva o que será analisado nessa data.");

  await prisma.efficacyCheck.create({
    data: {
      reviewId: review.id,
      scheduledDate: new Date(scheduledDate),
      description: description.trim(),
    },
  });

  revalidatePath("/tratamento");
}

// Edita a data/descrição de uma avaliação de eficácia já planejada (mesmo
// que já tenha sido concluída — não mexe no resultado registrado, só na
// data/descrição do planejamento).
async function updateEfficacyCheckActionImpl(
  checkId: string,
  scheduledDate: string,
  description: string
) {
  const session = await requireRole("GERENTE", "MASTER");
  const check = await prisma.efficacyCheck.findFirstOrThrow({
    where: { id: checkId },
    include: { review: true },
  });
  if (check.review.tenantId !== session.tenantId) throw new Error("FORBIDDEN");

  if (!scheduledDate) throw new Error("Informe a data da avaliação de eficácia.");
  if (!description?.trim()) throw new Error("Descreva o que será analisado nessa data.");

  await prisma.efficacyCheck.update({
    where: { id: checkId },
    data: {
      scheduledDate: new Date(scheduledDate),
      description: description.trim(),
    },
  });

  revalidatePath("/tratamento");
}

async function deleteEfficacyCheckActionImpl(checkId: string) {
  const session = await requireRole("GERENTE", "MASTER");
  const check = await prisma.efficacyCheck.findFirstOrThrow({
    where: { id: checkId },
    include: { review: true },
  });
  if (check.review.tenantId !== session.tenantId) throw new Error("FORBIDDEN");

  await prisma.efficacyCheck.delete({ where: { id: checkId } });

  revalidatePath("/tratamento");
}

async function finalizeReviewActionImpl(reviewId: string) {
  const session = await requireRole("GERENTE", "MASTER");
  const review = await prisma.review.findFirstOrThrow({
    where: { id: reviewId, tenantId: session.tenantId },
    include: { efficacyChecks: true },
  });

  const allChecked = review.efficacyChecks.every((c) => c.completedAt);
  const allEffective = review.efficacyChecks.every((c) => c.wasEffective);
  if (!allChecked) throw new Error("Ainda há avaliações de eficácia pendentes.");
  if (!allEffective) throw new Error("Há avaliações de eficácia marcadas como não efetivas.");

  await prisma.review.update({
    where: { id: review.id },
    data: { stage: "FINALIZADA" },
  });

  await logReviewEvent(review.id, session.userId, "FINALIZADA", "Avaliação finalizada.");

  await logAlert({
    tenantId: session.tenantId,
    type: "CARD_FINALIZADO",
    message: `Avaliação de ${review.guestName} (nota ${review.ratingNormalized.toFixed(2)}) finalizada.`,
    targetUserIds: [],
    reviewId: review.id,
  });

  revalidatePath("/tratamento");
}

// Nota: o fluxo antigo de "solicitar retrabalho ao Master" (requestReworkAction
// / decideReworkAction) não foi portado — Gerente e Master usam direto o
// reopenAnalysisAction acima pra voltar um card de Execução/Avaliação da
// Eficácia para Análise & Planejamento, sem precisar de aprovação de mais
// ninguém. O model ReworkRequest do v1 já estava marcado como legado e não
// tem equivalente no schema v2.

// Marca compliance da coleta diária — chamado ao registrar um CollectionRun manual.
export async function computeAnalysisDueDate(from: Date) {
  return addBusinessDays(from, 2);
}

export async function triggerCollectionRunAction() {
  const session = await requireRole("GERENTE", "MASTER");
  const run = await prisma.collectionRun.create({
    data: {
      tenantId: session.tenantId,
      triggeredById: session.userId,
      status: "PENDING",
      notes: "Coleta da Booking ainda é manual — sem e-mail/API disponível, exige login ao vivo na extranet.",
    },
  });
  revalidatePath("/tratamento");
  return run.id;
}

export type RegisterBookingReviewInput = {
  guestName: string;
  propertyId: string;
  checkInDate: string; // data da hospedagem (YYYY-MM-DD)
  ratingRaw: number; // nota na escala 0-10 da Booking
  comment: string;
};

// Registro manual de avaliação da Booking. Não lê a extranet de forma
// nenhuma — a Booking proíbe acesso automatizado à extranet em seus termos
// de uso (risco de suspensão da conta), então aqui é sempre uma pessoa que
// olha a extranet e digita o que viu. Property é obrigatória, igual à coleta
// do Airbnb — todo card precisa estar associado a uma propriedade já
// cadastrada.
async function registerBookingReviewActionImpl(input: RegisterBookingReviewInput) {
  const session = await requireRole("GERENTE", "MASTER");

  const guestName = input.guestName?.trim();
  if (!guestName) throw new Error("Informe o nome do hóspede.");
  if (!input.propertyId) throw new Error("Selecione a propriedade.");
  if (!input.checkInDate) throw new Error("Informe a data da hospedagem.");
  if (
    input.ratingRaw === undefined ||
    input.ratingRaw === null ||
    Number.isNaN(input.ratingRaw) ||
    input.ratingRaw < 0 ||
    input.ratingRaw > 10
  ) {
    throw new Error("Informe uma nota válida entre 0 e 10.");
  }

  const property = await prisma.property.findFirstOrThrow({
    where: { id: input.propertyId, tenantId: session.tenantId },
  });

  const ratingNormalized = normalizeToFiveStars(input.ratingRaw, 10);

  const review = await prisma.review.create({
    data: {
      tenantId: session.tenantId,
      platform: "BOOKING",
      guestName,
      propertyId: property.id,
      comment: input.comment?.trim() || null,
      ratingRaw: input.ratingRaw,
      ratingScaleMax: 10,
      ratingNormalized,
      checkInDate: new Date(input.checkInDate),
      guestSubmittedAt: new Date(),
      analysisDueAt: addBusinessDays(new Date(), 2),
    },
  });

  await logReviewEvent(review.id, session.userId, "CRIADA", "Avaliação registrada manualmente (Booking).");

  revalidatePath("/tratamento");
  revalidatePath("/dashboard");

  return review.id;
}

// Master/Gerente pode corrigir a propriedade de um card a qualquer momento
// (ex: e-mail do Airbnb identificou a propriedade errada, ou o card veio de
// uma pendência resolvida com um palpite provisório).
async function updateReviewPropertyActionImpl(reviewId: string, propertyId: string) {
  const session = await requireRole("GERENTE", "MASTER");
  if (!propertyId) throw new Error("Selecione a propriedade.");

  const review = await prisma.review.findFirstOrThrow({
    where: { id: reviewId, tenantId: session.tenantId },
    include: { property: true },
  });
  const property = await prisma.property.findFirstOrThrow({
    where: { id: propertyId, tenantId: session.tenantId },
  });

  await prisma.review.update({
    where: { id: review.id },
    data: { propertyId: property.id },
  });

  if (review.propertyId !== property.id) {
    await logReviewEvent(
      review.id,
      session.userId,
      "PROPRIEDADE_ALTERADA",
      `Propriedade alterada de "${review.property?.nome ?? "—"}" para "${property.nome}".`
    );
  }

  revalidatePath("/tratamento");
  revalidatePath("/dashboard");
}

// Coleta real do Airbnb: busca e-mails novos via Microsoft Graph e importa
// direto no banco. Só roda de fato para o tenant configurado em
// AIRBNB_INTEGRATION_TENANT_ID (evita tentar rodar contra tenants de teste).
export async function runAirbnbCollectionAction(): Promise<{
  success: boolean;
  created: number;
  message: string;
}> {
  const session = await requireRole("GERENTE", "MASTER");

  const integrationTenantId = process.env.AIRBNB_INTEGRATION_TENANT_ID;
  if (!integrationTenantId || session.tenantId !== integrationTenantId) {
    return {
      success: false,
      created: 0,
      message: "Coleta automática do Airbnb ainda não está configurada para este tenant.",
    };
  }

  const run = await prisma.collectionRun.create({
    data: {
      tenantId: session.tenantId,
      triggeredById: session.userId,
      status: "PENDING",
      notes: "Coleta do Airbnb via Microsoft Graph, disparada pela interface.",
    },
  });

  try {
    const reviewsConfig = await prisma.reviewsConfig.findUnique({
      where: { tenantId: session.tenantId },
    });
    const { items, unmatchedSubjects, maxReceivedAt } = await collectNewAirbnbReviews(
      reviewsConfig?.airbnbLastCollectedAt ?? null
    );

    // Property é obrigatória em todo card — quando o e-mail permite
    // identificar uma propriedade já cadastrada, o card já nasce completo.
    // Quando não permite (nenhum nome de propriedade no e-mail, ou o nome
    // não bate com nenhuma Property cadastrada), a avaliação fica pendente
    // pra alguém atribuir a propriedade manualmente antes dela virar card de
    // verdade no Kanban (ver resolvePendingAirbnbImportAction) — esta
    // rotina NUNCA cria uma Property nova.
    let createdCount = 0;
    let pendingCount = 0;
    for (const item of items) {
      const propertyId = item.propertyName
        ? await findPropertyByNome(session.tenantId, item.propertyName)
        : null;

      if (propertyId) {
        const ratingNormalized = normalizeToFiveStars(item.ratingRaw, 5);
        await prisma.review.create({
          data: {
            tenantId: session.tenantId,
            platform: "AIRBNB",
            guestName: item.guestName,
            ratingRaw: item.ratingRaw,
            ratingScaleMax: 5,
            ratingNormalized,
            guestSubmittedAt: item.guestSubmittedAt,
            checkInDate: item.checkInDate ?? undefined,
            propertyId,
            analysisDueAt: addBusinessDays(new Date(), 2),
          },
        });
        createdCount++;
      } else {
        await prisma.pendingAirbnbImport.create({
          data: {
            tenantId: session.tenantId,
            guestName: item.guestName,
            ratingRaw: item.ratingRaw,
            guestSubmittedAt: item.guestSubmittedAt,
            checkInDate: item.checkInDate ?? undefined,
          },
        });
        pendingCount++;
      }
    }

    if (maxReceivedAt) {
      await prisma.reviewsConfig.upsert({
        where: { tenantId: session.tenantId },
        update: { airbnbLastCollectedAt: maxReceivedAt },
        create: { tenantId: session.tenantId, airbnbLastCollectedAt: maxReceivedAt },
      });
    }

    await prisma.collectionRun.update({
      where: { id: run.id },
      data: { status: "DONE", reviewsCollected: createdCount },
    });

    revalidatePath("/tratamento");
    revalidatePath("/dashboard");

    if (pendingCount > 0) {
      const managers = await prisma.user.findMany({
        where: { tenantId: session.tenantId, role: { in: ["MASTER", "GERENTE"] }, ativo: true },
      });
      await logAlert({
        tenantId: session.tenantId,
        type: "PROPRIEDADE_PENDENTE",
        message: `${pendingCount} avaliação(ões) do Airbnb foram coletadas, mas o e-mail não permitiu identificar a propriedade (ou o nome não bateu com nenhuma UH cadastrada). Atribua manualmente em Tratamento antes que elas virem cards.`,
        targetUserIds: managers.map((m) => m.id),
      });
    }

    const unmatchedNote =
      unmatchedSubjects.length > 0
        ? ` (${unmatchedSubjects.length} e-mail(s) com assunto não reconhecido foram ignorados)`
        : "";
    const pendingNote = pendingCount > 0 ? ` (${pendingCount} aguardando propriedade manual)` : "";

    return {
      success: true,
      created: createdCount,
      message:
        createdCount > 0 || pendingCount > 0
          ? `${createdCount} avaliação(ões) nova(s) do Airbnb importada(s).${pendingNote}${unmatchedNote}`
          : `Nenhuma avaliação nova do Airbnb encontrada.${unmatchedNote}`,
    };
  } catch (err) {
    await prisma.collectionRun.update({
      where: { id: run.id },
      data: { status: "FAILED", notes: String(err instanceof Error ? err.message : err) },
    });
    return {
      success: false,
      created: 0,
      message: `Falha na coleta do Airbnb: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// Gerente/Master atribui a propriedade a uma avaliação do Airbnb que ficou
// pendente (e-mail não permitiu identificar automaticamente uma propriedade
// já cadastrada) — só então ela vira um card de verdade no Kanban.
async function resolvePendingAirbnbImportActionImpl(pendingId: string, propertyId: string) {
  const session = await requireRole("GERENTE", "MASTER");
  if (!propertyId) throw new Error("Selecione a propriedade.");

  const pending = await prisma.pendingAirbnbImport.findFirstOrThrow({
    where: { id: pendingId, tenantId: session.tenantId },
  });
  const property = await prisma.property.findFirstOrThrow({
    where: { id: propertyId, tenantId: session.tenantId },
  });

  const ratingNormalized = normalizeToFiveStars(pending.ratingRaw, 5);

  const [createdReview] = await prisma.$transaction([
    prisma.review.create({
      data: {
        tenantId: session.tenantId,
        platform: "AIRBNB",
        guestName: pending.guestName,
        ratingRaw: pending.ratingRaw,
        ratingScaleMax: 5,
        ratingNormalized,
        guestSubmittedAt: pending.guestSubmittedAt,
        checkInDate: pending.checkInDate ?? undefined,
        propertyId: property.id,
        analysisDueAt: addBusinessDays(new Date(), 2),
      },
    }),
    prisma.pendingAirbnbImport.delete({ where: { id: pending.id } }),
  ]);

  await logReviewEvent(
    createdReview.id,
    session.userId,
    "CRIADA",
    `Avaliação do Airbnb — propriedade atribuída manualmente (${property.nome}).`
  );

  revalidatePath("/tratamento");
  revalidatePath("/dashboard");
}

// Descarta uma pendência sem criar o card — para quando a avaliação for
// duplicada, teste, ou não fizer sentido registrar.
async function dismissPendingAirbnbImportActionImpl(pendingId: string) {
  const session = await requireRole("GERENTE", "MASTER");
  const pending = await prisma.pendingAirbnbImport.findFirstOrThrow({
    where: { id: pendingId, tenantId: session.tenantId },
  });
  await prisma.pendingAirbnbImport.delete({ where: { id: pending.id } });
  revalidatePath("/tratamento");
}

// Observações gerenciais: qualquer papel autenticado pode registrar uma nota
// livre num card, em qualquer estágio do Kanban. Não altera o fluxo/estágio
// da avaliação — é só um histórico de anotações.
async function addManagerialNoteActionImpl(reviewId: string, text: string) {
  const session = await requireSession();

  const trimmed = text?.trim();
  if (!trimmed) throw new Error("Escreva algo antes de salvar a observação.");

  const review = await prisma.review.findFirstOrThrow({
    where: { id: reviewId, tenantId: session.tenantId },
  });

  await prisma.managerialNote.create({
    data: {
      reviewId: review.id,
      authorId: session.userId,
      text: trimmed,
    },
  });

  revalidatePath("/tratamento");
}

// Só quem escreveu a observação pode editá-la.
async function updateManagerialNoteActionImpl(noteId: string, text: string) {
  const session = await requireSession();

  const trimmed = text?.trim();
  if (!trimmed) throw new Error("Escreva algo antes de salvar a observação.");

  const note = await prisma.managerialNote.findFirstOrThrow({
    where: { id: noteId },
    include: { review: true },
  });
  if (note.review.tenantId !== session.tenantId) throw new Error("FORBIDDEN");
  if (note.authorId !== session.userId) {
    throw new Error("Só quem escreveu a observação pode editá-la.");
  }

  await prisma.managerialNote.update({
    where: { id: noteId },
    data: { text: trimmed },
  });

  revalidatePath("/tratamento");
}

// Quem escreveu a observação pode excluí-la; Master e Gerente também podem
// remover observações de qualquer pessoa (moderação).
async function deleteManagerialNoteActionImpl(noteId: string) {
  const session = await requireSession();

  const note = await prisma.managerialNote.findFirstOrThrow({
    where: { id: noteId },
    include: { review: true },
  });
  if (note.review.tenantId !== session.tenantId) throw new Error("FORBIDDEN");

  const canDelete =
    note.authorId === session.userId ||
    session.role === "MASTER" ||
    session.role === "GERENTE";
  if (!canDelete) throw new Error("Você não tem permissão para excluir esta observação.");

  await prisma.managerialNote.delete({ where: { id: noteId } });

  revalidatePath("/tratamento");
}

// Anexos (imagens e/ou documentos) num card de avaliação: qualquer usuário
// autenticado pode subir. Arquivo vai pro Cloudinary; guardamos só a
// referência no banco. Mesmo padrão dos anexos de Reuniões de Performance.
async function addReviewAttachmentActionImpl(formData: FormData) {
  const session = await requireSession();
  const reviewId = String(formData.get("reviewId") ?? "");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Selecione um arquivo.");
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("Arquivo muito grande (máximo 4,5 MB).");
  }

  const review = await prisma.review.findFirstOrThrow({
    where: { id: reviewId, tenantId: session.tenantId },
  });

  const uploaded = await uploadToCloudinary(file, `reviews/${review.id}`);

  await prisma.reviewAttachment.create({
    data: {
      reviewId: review.id,
      uploadedById: session.userId,
      fileName: file.name,
      fileUrl: uploaded.url,
      fileSize: file.size,
      contentType: file.type || null,
    },
  });

  revalidatePath("/tratamento");
}

// Quem subiu o anexo pode excluir; Master/Gerente também podem (moderação).
async function deleteReviewAttachmentActionImpl(attachmentId: string) {
  const session = await requireSession();
  const attachment = await prisma.reviewAttachment.findFirstOrThrow({
    where: { id: attachmentId },
    include: { review: true },
  });
  if (attachment.review.tenantId !== session.tenantId) throw new Error("FORBIDDEN");

  const canDelete =
    attachment.uploadedById === session.userId ||
    session.role === "MASTER" ||
    session.role === "GERENTE";
  if (!canDelete) throw new Error("Você não tem permissão para excluir este anexo.");

  await deleteFromCloudinary(attachment.fileUrl);

  await prisma.reviewAttachment.delete({ where: { id: attachment.id } });

  revalidatePath("/tratamento");
}

// Exports finos por cima de cada Impl acima, usando safeAction: em produção
// o Next.js apaga a mensagem de qualquer erro que atravesse a fronteira de
// uma Server Action via throw, então cada uma dessas captura o erro por
// dentro e devolve como valor normal (ver src/lib/safeAction.ts). O
// componente cliente usa `unwrapSafeAction` pra desfazer isso e mostrar a
// mensagem de verdade no catch de sempre.
export async function deleteReviewAction(reviewId: string) {
  return safeAction(deleteReviewActionImpl)(reviewId);
}
export async function startAnalysisAction(reviewId: string) {
  return safeAction(startAnalysisActionImpl)(reviewId);
}
export async function moveDirectToFinalAction(reviewId: string) {
  return safeAction(moveDirectToFinalActionImpl)(reviewId);
}
export async function saveAnalysisAction(input: SaveAnalysisInput) {
  return safeAction(saveAnalysisActionImpl)(input);
}
export async function saveAnalysisDraftAction(input: SaveAnalysisInput) {
  return safeAction(saveAnalysisDraftActionImpl)(input);
}
export async function finalizeFiveStarAnalysisAction(input: FinalizeFiveStarInput) {
  return safeAction(finalizeFiveStarAnalysisActionImpl)(input);
}
export async function reopenAnalysisAction(reviewId: string) {
  return safeAction(reopenAnalysisActionImpl)(reviewId);
}
export async function rejectPlanningAction(reviewId: string, reason: string) {
  return safeAction(rejectPlanningActionImpl)(reviewId, reason);
}
export async function toggleActionItemAction(itemId: string, completed: boolean) {
  return safeAction(toggleActionItemActionImpl)(itemId, completed);
}
export async function completeExecutionAction(reviewId: string) {
  return safeAction(completeExecutionActionImpl)(reviewId);
}
export async function recordEfficacyAction(checkId: string, wasEffective: boolean, notes: string) {
  return safeAction(recordEfficacyActionImpl)(checkId, wasEffective, notes);
}
export async function addEfficacyCheckAction(reviewId: string, scheduledDate: string, description: string) {
  return safeAction(addEfficacyCheckActionImpl)(reviewId, scheduledDate, description);
}
export async function updateEfficacyCheckAction(checkId: string, scheduledDate: string, description: string) {
  return safeAction(updateEfficacyCheckActionImpl)(checkId, scheduledDate, description);
}
export async function deleteEfficacyCheckAction(checkId: string) {
  return safeAction(deleteEfficacyCheckActionImpl)(checkId);
}
export async function finalizeReviewAction(reviewId: string) {
  return safeAction(finalizeReviewActionImpl)(reviewId);
}
export async function registerBookingReviewAction(input: RegisterBookingReviewInput) {
  return safeAction(registerBookingReviewActionImpl)(input);
}
export async function updateReviewPropertyAction(reviewId: string, propertyId: string) {
  return safeAction(updateReviewPropertyActionImpl)(reviewId, propertyId);
}
export async function resolvePendingAirbnbImportAction(pendingId: string, propertyId: string) {
  return safeAction(resolvePendingAirbnbImportActionImpl)(pendingId, propertyId);
}
export async function dismissPendingAirbnbImportAction(pendingId: string) {
  return safeAction(dismissPendingAirbnbImportActionImpl)(pendingId);
}
export async function addManagerialNoteAction(reviewId: string, text: string) {
  return safeAction(addManagerialNoteActionImpl)(reviewId, text);
}
export async function updateManagerialNoteAction(noteId: string, text: string) {
  return safeAction(updateManagerialNoteActionImpl)(noteId, text);
}
export async function deleteManagerialNoteAction(noteId: string) {
  return safeAction(deleteManagerialNoteActionImpl)(noteId);
}
export async function addReviewAttachmentAction(formData: FormData) {
  return safeAction(addReviewAttachmentActionImpl)(formData);
}
export async function deleteReviewAttachmentAction(attachmentId: string) {
  return safeAction(deleteReviewAttachmentActionImpl)(attachmentId);
}
