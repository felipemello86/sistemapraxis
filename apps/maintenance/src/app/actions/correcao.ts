"use server";

import { revalidatePath } from "next/cache";
import { getSession, hasModuleAccess, prisma, resolveCorrectionCard } from "@praxis/core";
import { dataAtualSP } from "@praxis/core";
import { safeAction } from "@/lib/safeAction";
import {
  calcularConformidadeAtual,
  enviarResultadoDiarioSeNecessario,
  notificarPorRoles,
  notificarTodosDoTenant,
} from "@/lib/dailyReport";

// Server Actions da tela "Correção" (Aquisição / Serviços Externos /
// Execução) — arquivo separado de data.ts porque esse fluxo cresceu bastante
// (fornecedores, agendamento com log, compromisso diário) e mereceu um
// arquivo próprio. Mesmo padrão de sessão/autorização de data.ts
// (requireModuleSession local, cada arquivo de actions tem a sua — evita
// exportar esse helper de um arquivo "use server", que o transformaria
// sem querer numa Server Action chamável do client).

async function requireModuleSession() {
  const session = await getSession();
  if (!session) throw new Error("Não autenticado.");
  const podeAcessar = await hasModuleAccess(session, "MAINTENANCE");
  if (!podeAcessar) throw new Error("Sem acesso ao módulo Manutenção.");
  return session;
}

async function getCardOrThrow(cardId: string, tenantId: string) {
  const card = await prisma.maintenanceCorrectionCard.findUnique({ where: { id: cardId } });
  if (!card || card.tenantId !== tenantId) throw new Error("Card de Correção não encontrado.");
  return card;
}

/* ------------------------------ Aquisição -------------------------------- */

async function comprarMaterialImpl(input: { cardId: string; receiptPhotoUrl: string }) {
  const session = await requireModuleSession();
  const card = await getCardOrThrow(input.cardId, session.tenantId);

  if (!card.needsMaterial) throw new Error("Este card não precisa de material.");
  if (card.materialStatus === "COMPRADO") throw new Error("Material já foi marcado como comprado.");
  if (!input.receiptPhotoUrl) throw new Error("Anexe a foto do cupom fiscal.");

  await prisma.maintenanceCorrectionCard.update({
    where: { id: card.id },
    data: {
      materialStatus: "COMPRADO",
      materialReceiptPhoto: input.receiptPhotoUrl,
      materialCompradoEm: new Date(),
      materialCompradoPorId: session.userId,
    },
  });

  revalidatePath("/");
}
export const comprarMaterialAction = safeAction(comprarMaterialImpl);

/* -------------------------- Serviços Externos ----------------------------- */

async function registrarCotacaoImpl(input: {
  cardId: string;
  supplierId?: string;
  novoFornecedor?: { nome: string; contato?: string; observacao?: string };
}) {
  const session = await requireModuleSession();
  const card = await getCardOrThrow(input.cardId, session.tenantId);
  if (!card.needsExternalService) throw new Error("Este card não precisa de serviço externo.");

  let supplierId = input.supplierId ?? null;

  if (!supplierId) {
    const nome = input.novoFornecedor?.nome?.trim();
    if (!nome) throw new Error("Informe o nome do fornecedor.");
    const novo = await prisma.maintenanceSupplier.create({
      data: {
        tenantId: session.tenantId,
        nome,
        contato: input.novoFornecedor?.contato?.trim() || null,
        observacao: input.novoFornecedor?.observacao?.trim() || null,
      },
    });
    supplierId = novo.id;
  } else {
    const s = await prisma.maintenanceSupplier.findUnique({
      where: { id: supplierId },
      select: { tenantId: true },
    });
    if (!s || s.tenantId !== session.tenantId) throw new Error("Fornecedor não encontrado.");
  }

  if (card.checklistItemId) {
    await prisma.maintenanceSupplierChecklistItem.upsert({
      where: { supplierId_checklistItemId: { supplierId, checklistItemId: card.checklistItemId } },
      create: { supplierId, checklistItemId: card.checklistItemId },
      update: {},
    });
  }

  await prisma.$transaction([
    prisma.maintenanceCorrectionSupplierQuote.create({
      data: { tenantId: session.tenantId, cardId: card.id, supplierId, createdById: session.userId },
    }),
    prisma.maintenanceCorrectionCard.update({
      where: { id: card.id },
      data: {
        externalServiceStatus: card.externalServiceStatus === "A_CONTRATAR" ? "EM_NEGOCIACAO" : card.externalServiceStatus,
      },
    }),
  ]);

  revalidatePath("/");
}
export const registrarCotacaoAction = safeAction(registrarCotacaoImpl);

async function agendarServicoImpl(input: { cardId: string; supplierId: string; date: string }) {
  const session = await requireModuleSession();
  const card = await getCardOrThrow(input.cardId, session.tenantId);
  if (!card.needsExternalService) throw new Error("Este card não precisa de serviço externo.");

  // Gate explícito: só agenda depois do material (se precisar) já ter sido
  // comprado — pedido do Felipe.
  if (card.needsMaterial && card.materialStatus !== "COMPRADO") {
    throw new Error("Compre o material antes de agendar o serviço.");
  }

  const cotacoes = await prisma.maintenanceCorrectionSupplierQuote.findMany({
    where: { cardId: card.id },
    include: { supplier: { select: { id: true, nome: true } } },
  });
  const escolhido = cotacoes.find((c) => c.supplierId === input.supplierId);
  if (!escolhido) {
    throw new Error("Selecione um fornecedor que já foi registrado na negociação deste card.");
  }
  if (!input.date) throw new Error("Selecione a data do serviço.");

  const novaData = new Date(`${input.date}T00:00:00.000Z`);

  // Reagendamento — gera log (pedido explícito: "pode ser editado depois,
  // gerando um log de edição").
  if (card.hiredSupplierId || card.scheduledDate) {
    const fornecedorAnterior = card.hiredSupplierId
      ? await prisma.maintenanceSupplier.findUnique({ where: { id: card.hiredSupplierId }, select: { nome: true } })
      : null;
    await prisma.maintenanceSchedulingLog.create({
      data: {
        tenantId: session.tenantId,
        cardId: card.id,
        previousSupplierId: card.hiredSupplierId,
        previousSupplierNome: fornecedorAnterior?.nome ?? null,
        previousDate: card.scheduledDate,
        newSupplierId: input.supplierId,
        newSupplierNome: escolhido.supplier.nome,
        newDate: novaData,
        authorId: session.userId,
      },
    });
  }

  await prisma.maintenanceCorrectionCard.update({
    where: { id: card.id },
    data: {
      hiredSupplierId: input.supplierId,
      scheduledDate: novaData,
      scheduledById: session.userId,
      externalServiceStatus: "AGENDADO",
    },
  });

  revalidatePath("/");
}
export const agendarServicoAction = safeAction(agendarServicoImpl);

async function executarServicoImpl(input: { cardId: string; description: string; photos: string[] }) {
  const session = await requireModuleSession();
  const card = await getCardOrThrow(input.cardId, session.tenantId);
  if (!card.needsExternalService) throw new Error("Este card não precisa de serviço externo.");
  if (card.externalServiceStatus !== "AGENDADO") {
    throw new Error("Este card ainda não foi agendado.");
  }

  const description = input.description.trim();
  if (description.length < 5) throw new Error("Descreva o que foi feito (mínimo 5 caracteres).");

  await resolveCorrectionCard({
    cardId: card.id,
    tenantId: session.tenantId,
    description,
    photos: input.photos ?? [],
    authorId: session.userId,
  });

  await prisma.maintenanceCorrectionCard.update({
    where: { id: card.id },
    data: { externalServiceStatus: "EXECUTADO" },
  });

  revalidatePath("/");
}
export const executarServicoAction = safeAction(executarServicoImpl);

/* ---------------------------------- Execução ------------------------------ */

async function fecharProgramacaoDiaImpl(input: {
  cardIds: string[];
  blockMap?: Record<string, boolean>;
}) {
  const session = await requireModuleSession();
  const data = dataAtualSP();

  const existente = await prisma.maintenanceDailyCommitment.findUnique({
    where: { tenantId_data: { tenantId: session.tenantId, data } },
  });
  if (existente) throw new Error("A programação de hoje já foi fechada.");

  if (input.cardIds.length === 0) {
    throw new Error("Selecione ao menos um card pra fechar a programação do dia.");
  }

  const cards = await prisma.maintenanceCorrectionCard.findMany({
    where: { id: { in: input.cardIds }, tenantId: session.tenantId },
    include: { uh: { select: { id: true } } },
  });
  if (cards.length !== input.cardIds.length) throw new Error("Algum card selecionado não foi encontrado.");

  for (const card of cards) {
    if (card.needsExternalService) {
      throw new Error("Cards com serviço externo não entram no Kanban de Execução.");
    }
    if (card.needsMaterial && card.materialStatus !== "COMPRADO") {
      throw new Error("Algum card selecionado ainda precisa de material comprado.");
    }
    if (card.executionStatus !== "A_FAZER") {
      throw new Error("Algum card selecionado já está numa programação.");
    }
  }

  const conformidadeAntes = await calcularConformidadeAtual(session.tenantId);

  const commitment = await prisma.maintenanceDailyCommitment.create({
    data: {
      tenantId: session.tenantId,
      data,
      closedById: session.userId,
      conformidadeAntes,
      totalPrevisto: cards.length,
    },
  });

  await prisma.$transaction(
    cards.map((card) =>
      prisma.maintenanceCorrectionCard.update({
        where: { id: card.id },
        data: {
          dailyCommitmentId: commitment.id,
          executionStatus: "PLANEJADA",
          blockForReservation: input.blockMap?.[card.id] ?? false,
        },
      }),
    ),
  );

  // Aciona a flag "em manutenção" (UH) pra toda UH envolvida na programação
  // do dia — pedido explícito, só depois do fechamento (não na seleção).
  const uhIds = Array.from(new Set(cards.map((c) => c.uhId)));
  await prisma.uH.updateMany({
    where: { id: { in: uhIds } },
    data: { emManutencao: true },
  });

  await notificarTodosDoTenant(session.tenantId, {
    title: "🔧 Programação de manutenção de hoje",
    body: `${cards.length} ${cards.length === 1 ? "item planejado" : "itens planejados"} pra hoje no Kanban de Execução.`,
    data: { view: "correcao" },
  });

  const uhsParaBloquear = cards.filter((c) => input.blockMap?.[c.id]);
  if (uhsParaBloquear.length > 0) {
    await notificarPorRoles(session.tenantId, ["ATENDIMENTO", "GERENTE", "MASTER"], {
      title: "🚫 Bloqueio de UH pra reservas",
      body: `${uhsParaBloquear.length} UH(s) da manutenção de hoje precisam ser bloqueadas pra reservas.`,
      data: { view: "correcao" },
    });
  }

  revalidatePath("/");
}
export const fecharProgramacaoDiaAction = safeAction(fecharProgramacaoDiaImpl);

async function executarCardExecucaoImpl(input: { cardId: string; description: string; photos: string[] }) {
  const session = await requireModuleSession();
  const card = await getCardOrThrow(input.cardId, session.tenantId);
  if (card.executionStatus !== "PLANEJADA" || !card.dailyCommitmentId) {
    throw new Error("Este card não está na programação do dia.");
  }

  const description = input.description.trim();
  if (description.length < 5) throw new Error("Descreva o que foi feito (mínimo 5 caracteres).");

  await resolveCorrectionCard({
    cardId: card.id,
    tenantId: session.tenantId,
    description,
    photos: input.photos ?? [],
    authorId: session.userId,
  });

  await prisma.maintenanceCorrectionCard.update({
    where: { id: card.id },
    data: { executionStatus: "EXECUTADA" },
  });

  // Se esse era o último card pendente do compromisso, dispara o "Resultado
  // Diário" na hora — sem esperar o cron das 19h (o cron cobre o caso de
  // sobrar card não executado até lá, ver comentário no cron).
  const restantes = await prisma.maintenanceCorrectionCard.count({
    where: { dailyCommitmentId: card.dailyCommitmentId, executionStatus: { not: "EXECUTADA" } },
  });
  if (restantes === 0) {
    await enviarResultadoDiarioSeNecessario(card.dailyCommitmentId);
  }

  revalidatePath("/");
}
export const executarCardExecucaoAction = safeAction(executarCardExecucaoImpl);

/* ------------------------------ A Processar -------------------------------- */
// Cards sem triagem (needsMaterial/needsExternalService null) — nascem
// assim quando registrados pelo módulo Governança (camareira, governanta,
// flag de manutenção da Seleção e Liberação), que não pergunta isso, ver
// packages/core/src/maintenanceCorrection.ts. Cabe ao perfil Manutenção
// classificar aqui; depois de triado, o card sai de "A Processar" e passa a
// aparecer no(s) kanban(s) certo(s) — mesma lógica de kanbansDoCard.

async function triarCardAProcessarImpl(input: {
  cardId: string;
  needsMaterial: boolean;
  needsExternalService: boolean;
}) {
  const session = await requireModuleSession();
  const card = await getCardOrThrow(input.cardId, session.tenantId);

  if (card.needsMaterial !== null || card.needsExternalService !== null) {
    throw new Error("Este card já foi classificado.");
  }

  await prisma.maintenanceCorrectionCard.update({
    where: { id: card.id },
    data: {
      needsMaterial: input.needsMaterial,
      needsExternalService: input.needsExternalService,
      triagedAt: new Date(),
      triagedById: session.userId,
    },
  });

  revalidatePath("/");
}
export const triarCardAProcessarAction = safeAction(triarCardAProcessarImpl);

/* --------------------- Adicionar card urgente já com o dia fechado -------- */
// Depois que "Fechar programação do dia" já rodou, um novo card pode surgir
// (ex.: triado agora mesmo em "A Processar") e precisar entrar hoje mesmo,
// não esperar amanhã — pedido explícito do Felipe ("cards
// intempestivos/urgentes"). Mesmos gates de fecharProgramacaoDiaImpl (sem
// serviço externo, material já comprado se precisar, ainda A_FAZER), mas
// sem recriar o commitment — só anexa a ele, marcado previsto=false pra não
// inflar o denominador do % de realização (ver MaintenanceDailyCommitment.
// totalPrevisto).
async function adicionarCardUrgenteImpl(input: { cardId: string }) {
  const session = await requireModuleSession();
  const data = dataAtualSP();

  const commitment = await prisma.maintenanceDailyCommitment.findUnique({
    where: { tenantId_data: { tenantId: session.tenantId, data } },
  });
  if (!commitment) throw new Error("A programação de hoje ainda não foi fechada.");

  const card = await getCardOrThrow(input.cardId, session.tenantId);
  if (card.needsExternalService) {
    throw new Error("Cards com serviço externo não entram no Kanban de Execução.");
  }
  if (card.needsMaterial && card.materialStatus !== "COMPRADO") {
    throw new Error("Este card ainda precisa de material comprado.");
  }
  if (card.executionStatus !== "A_FAZER") {
    throw new Error("Este card já está numa programação.");
  }

  await prisma.maintenanceCorrectionCard.update({
    where: { id: card.id },
    data: {
      dailyCommitmentId: commitment.id,
      executionStatus: "PLANEJADA",
      previsto: false,
    },
  });

  revalidatePath("/");
}
export const adicionarCardUrgenteAction = safeAction(adicionarCardUrgenteImpl);
