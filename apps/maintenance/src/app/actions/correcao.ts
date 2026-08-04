"use server";

import { revalidatePath } from "next/cache";
import {
  aplicarBloqueioPorUrgencia,
  cancelarSolicitacaoBloqueioSeNecessario,
  corrigirItemDireto,
  emitEvent,
  getSession,
  hasModuleAccess,
  prisma,
  resolveCorrectionCard,
} from "@praxis/core";
import { dataAtualSP } from "@praxis/core";
import { safeAction } from "@/lib/safeAction";
import {
  calcularConformidadeAtual,
  enviarResultadoDiarioSeNecessario,
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

// getCardOrThrow acima devolve só os campos escalares do card (uhId,
// checklistItemId) — os pontos de log abaixo (pedido explícito do Felipe:
// cobertura completa de auditoria) precisam de nomes legíveis (UH/item) pro
// payload do AiEvent, pra tela "Log do Sistema" não precisar re-hidratar
// nada depois. Helper pequeno em vez de estender getCardOrThrow (usado por
// todo o arquivo, mudar o shape dele exigiria tocar em mais lugares que o
// necessário).
async function nomesDoCard(card: { uhId: string; checklistItemId: string | null }) {
  const [uh, item] = await Promise.all([
    prisma.uH.findUnique({ where: { id: card.uhId }, select: { numero: true } }),
    card.checklistItemId
      ? prisma.maintenanceChecklistItem.findUnique({ where: { id: card.checklistItemId }, select: { name: true } })
      : Promise.resolve(null),
  ]);
  return { uhNumero: uh?.numero ?? "—", itemNome: item?.name ?? null };
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

  const { uhNumero, itemNome } = await nomesDoCard(card);
  await emitEvent({
    tenantId: session.tenantId,
    module: "MAINTENANCE",
    eventType: "maintenance.log.material_comprado",
    entityType: "MaintenanceCorrectionCard",
    entityId: card.id,
    payload: { uhNumero, itemNome, atorNome: session.nome },
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
  let supplierNome: string;

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
    supplierNome = nome;
  } else {
    const s = await prisma.maintenanceSupplier.findUnique({
      where: { id: supplierId },
      select: { tenantId: true, nome: true },
    });
    if (!s || s.tenantId !== session.tenantId) throw new Error("Fornecedor não encontrado.");
    supplierNome = s.nome;
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

  const { uhNumero, itemNome } = await nomesDoCard(card);
  await emitEvent({
    tenantId: session.tenantId,
    module: "MAINTENANCE",
    eventType: "maintenance.log.cotacao_registrada",
    entityType: "MaintenanceCorrectionCard",
    entityId: card.id,
    payload: { uhNumero, itemNome, atorNome: session.nome, fornecedorNome: supplierNome },
  });

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

  // Log da tela "Log do Sistema" só cobre o PRIMEIRO agendamento — a partir
  // do segundo, o branch de reagendamento logo abaixo já cria um
  // MaintenanceSchedulingLog (tipo "reagendamento"), então logar os dois
  // duplicaria o mesmo evento na timeline (pedido explícito: não duplicar).
  const primeiroAgendamento = !card.hiredSupplierId && !card.scheduledDate;

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

  if (primeiroAgendamento) {
    const { uhNumero, itemNome } = await nomesDoCard(card);
    await emitEvent({
      tenantId: session.tenantId,
      module: "MAINTENANCE",
      eventType: "maintenance.log.servico_agendado",
      entityType: "MaintenanceCorrectionCard",
      entityId: card.id,
      payload: {
        uhNumero,
        itemNome,
        atorNome: session.nome,
        fornecedorNome: escolhido.supplier.nome,
        data: input.date,
      },
    });
  }

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
    include: {
      uh: { select: { id: true, numero: true } },
      checklistItem: { select: { name: true } },
      inspectionItem: { select: { comment: true } },
    },
  });
  // `include` acima já traz todas as colunas escalares do card, inclusive
  // `canceladoPorLiberacao` — usado abaixo pra montar totalPrevisto.
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

  // Cards cancelados por exclusão de UH (ver cancelarCardsPorExclusaoDeUh em
  // packages/core) não devem entrar no denominador congelado do % de
  // realização, mesmo que alguém ainda os selecione aqui — mesmo tratamento
  // que já reservávamos pra "previsto=false" nos cards intempestivos
  // (adicionarCardUrgenteImpl), só que aplicado já na hora do fechamento.
  const totalPrevisto = cards.filter((c) => !c.canceladoPorLiberacao).length;

  const commitment = await prisma.maintenanceDailyCommitment.create({
    data: {
      tenantId: session.tenantId,
      data,
      closedById: session.userId,
      conformidadeAntes,
      totalPrevisto,
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

  // Bug corrigido (31/07/2026, relato do Felipe): marcar "Sim" aqui só
  // gravava blockForReservation (campo puramente informativo, ver comentário
  // no schema) e mandava um aviso solto — nenhum HkBlockRequest chegava a
  // existir, então nada aparecia na tela Decisão de Bloqueio pro Atendimento
  // decidir. Pior, a UI mostrava "UH bloqueada" pro pessoal de Manutenção
  // como se já estivesse em vigor. Agora passa pelo mesmo mecanismo de
  // aprovação da NC urgente (aplicarBloqueioPorUrgencia): cria o pedido
  // PENDENTE e notifica Atendimento/Gerente/Governanta/Master — o bloqueio
  // continua sendo decisão humana do Atendimento, nunca automático.
  const uhsParaBloquear = cards.filter((c) => input.blockMap?.[c.id]);
  const uhIdsJaPedidos = new Set<string>();
  for (const card of uhsParaBloquear) {
    if (uhIdsJaPedidos.has(card.uhId)) continue;
    uhIdsJaPedidos.add(card.uhId);
    await aplicarBloqueioPorUrgencia({
      tenantId: session.tenantId,
      uhId: card.uhId,
      checklistItemId: card.checklistItemId,
      comment:
        card.inspectionItem?.comment?.trim() ||
        "UH marcada para bloqueio no fechamento da programação do dia.",
      solicitanteNome: session.nome,
    });
  }

  // Pedido mais explícito do Felipe pra essa tela: registrar quais cards
  // (UH + item) entraram no fechamento — 1 evento com N cards dentro, não 1
  // evento por card, pra não poluir a timeline.
  await emitEvent({
    tenantId: session.tenantId,
    module: "MAINTENANCE",
    eventType: "maintenance.log.programacao_fechada",
    entityType: "MaintenanceDailyCommitment",
    entityId: commitment.id,
    payload: {
      data,
      totalCards: cards.length,
      fechadoPor: session.nome,
      cards: cards.map((c) => ({ uhNumero: c.uh.numero, itemNome: c.checklistItem?.name ?? null })),
    },
  });

  revalidatePath("/");
}
export const fecharProgramacaoDiaAction = safeAction(fecharProgramacaoDiaImpl);

// Pedido explícito do Felipe: "criar a função de reabrir programação do dia
// (para casos de erro de fechamento da programação)". Só cobre esse cenário
// de engano imediato — por isso os dois gates abaixo: nenhum card pode já
// ter sido executado (senão teria trabalho real acontecendo em cima da
// programação, não dá pra simplesmente desfazer) e o Resultado Diário ainda
// não pode ter sido enviado (reportSentAt), que só acontece quando o último
// card é executado ou o cron das 19h roda — ambos os casos já implicam
// "não é mais só um erro de clique".
//
// `data = dataAtualSP()` no lookup já restringe isso à programação de HOJE
// — não dá pra reabrir um fechamento de um dia anterior por aqui (fora do
// escopo pedido: "erro de fechamento", não "desfazer histórico").
//
// De propósito NÃO mexe em UH.emManutencao: esse campo é de posse
// compartilhada (ver comentário em ativarManutencaoUH/toggle_manutencao,
// packages/core/src/maintenanceUrgente.ts) — desligá-lo aqui de volta
// poderia liberar uma UH que ainda precisa de manutenção por outro motivo
// (a não conformidade continua aberta, só a programação de hoje é desfeita).
async function reabrirProgramacaoDiaImpl() {
  const session = await requireModuleSession();
  const data = dataAtualSP();

  const commitment = await prisma.maintenanceDailyCommitment.findUnique({
    where: { tenantId_data: { tenantId: session.tenantId, data } },
    include: {
      closedBy: { select: { nome: true } },
      cards: {
        include: {
          uh: { select: { numero: true } },
          checklistItem: { select: { name: true } },
        },
      },
    },
  });
  if (!commitment) throw new Error("A programação de hoje ainda não foi fechada.");

  if (commitment.reportSentAt) {
    throw new Error("O Resultado Diário de hoje já foi enviado — não é mais possível reabrir a programação.");
  }
  if (commitment.cards.some((c) => c.executionStatus === "EXECUTADA")) {
    throw new Error("Já existe item executado na programação de hoje — não é mais possível reabrir.");
  }

  // Emitido ANTES do delete abaixo, de propósito: o MaintenanceDailyCommitment
  // some do banco na sequência, então este AiEvent é o único rastro que
  // sobra de "o que tinha sido fechado e foi desfeito" (pedido explícito do
  // Felipe — sem isso a informação se perde pra sempre).
  await emitEvent({
    tenantId: session.tenantId,
    module: "MAINTENANCE",
    eventType: "maintenance.log.programacao_reaberta",
    entityType: "MaintenanceDailyCommitment",
    entityId: commitment.id,
    payload: {
      data,
      totalCards: commitment.cards.length,
      reabertoPor: session.nome,
      fechadoOriginalmenteEm: commitment.closedAt.toISOString(),
      fechadoPor: commitment.closedBy?.nome ?? null,
      cards: commitment.cards.map((c) => ({ uhNumero: c.uh.numero, itemNome: c.checklistItem?.name ?? null })),
    },
  });

  await prisma.$transaction([
    prisma.maintenanceCorrectionCard.updateMany({
      where: { dailyCommitmentId: commitment.id },
      data: {
        dailyCommitmentId: null,
        executionStatus: "A_FAZER",
        blockForReservation: null,
        previsto: true,
      },
    }),
    prisma.maintenanceDailyCommitment.delete({ where: { id: commitment.id } }),
  ]);

  revalidatePath("/");
}
export const reabrirProgramacaoDiaAction = safeAction(reabrirProgramacaoDiaImpl);

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
async function adicionarCardUrgenteImpl(input: { cardId: string; block?: boolean }) {
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
      blockForReservation: input.block ?? false,
    },
  });

  // Mesmo pedido de aprovação que o fechamento normal da programação dispara
  // pra UH marcada — mesmo bug e mesma correção de fecharProgramacaoDiaImpl
  // (ver comentário lá): antes só mandava aviso solto, sem HkBlockRequest.
  if (input.block) {
    await aplicarBloqueioPorUrgencia({
      tenantId: session.tenantId,
      uhId: card.uhId,
      checklistItemId: card.checklistItemId,
      comment: "Card intempestivo adicionado à programação do dia — UH marcada para bloqueio.",
      solicitanteNome: session.nome,
    });
  }

  const { uhNumero, itemNome } = await nomesDoCard(card);
  await emitEvent({
    tenantId: session.tenantId,
    module: "MAINTENANCE",
    eventType: "maintenance.log.card_urgente_adicionado",
    entityType: "MaintenanceCorrectionCard",
    entityId: card.id,
    payload: { uhNumero, itemNome, atorNome: session.nome, bloqueado: Boolean(input.block) },
  });

  revalidatePath("/");
}
export const adicionarCardUrgenteAction = safeAction(adicionarCardUrgenteImpl);

/* --------------------- Retirar card da programação do dia ----------------- */
// Pedido explícito do Felipe (01/08/2026): opção de excluir/retirar um card
// individual da coluna "Planejadas" — diferente de "Reabrir programação do
// dia" (reabrirProgramacaoDiaImpl), que desfaz o fechamento inteiro. Aqui só
// este card sai: volta pra "A Fazer" (sem dailyCommitmentId), como se nunca
// tivesse sido incluído no fechamento de hoje. Se ele estava contando no
// denominador congelado (previsto=true, ver MaintenanceDailyCommitment.
// totalPrevisto), decrementa agora — senão o % de realização do dia ficaria
// artificialmente mais baixo por um card que foi legitimamente retirado, não
// deixado pra trás. Também limpa canceladoPorLiberacao/canceladoEm (ver
// cancelarCardsPorExclusaoDeUh, packages/core): ao sair da programação de
// hoje por completo, esse motivo específico deixa de fazer sentido.
async function retirarCardDaProgramacaoImpl(input: { cardId: string }) {
  const session = await requireModuleSession();
  const card = await getCardOrThrow(input.cardId, session.tenantId);

  if (card.executionStatus !== "PLANEJADA" || !card.dailyCommitmentId) {
    throw new Error("Este card não está na programação de hoje.");
  }

  const dailyCommitmentId = card.dailyCommitmentId;

  await prisma.maintenanceCorrectionCard.update({
    where: { id: card.id },
    data: {
      executionStatus: "A_FAZER",
      dailyCommitmentId: null,
      blockForReservation: null,
      previsto: true,
      canceladoPorLiberacao: false,
      canceladoEm: null,
    },
  });

  if (card.previsto) {
    await prisma.maintenanceDailyCommitment.update({
      where: { id: dailyCommitmentId },
      data: { totalPrevisto: { decrement: 1 } },
    });
  }

  const { uhNumero, itemNome } = await nomesDoCard(card);
  await emitEvent({
    tenantId: session.tenantId,
    module: "MAINTENANCE",
    eventType: "maintenance.log.card_retirado_da_programacao",
    entityType: "MaintenanceCorrectionCard",
    entityId: card.id,
    payload: { uhNumero, itemNome, atorNome: session.nome },
  });

  revalidatePath("/");
}
export const retirarCardDaProgramacaoAction = safeAction(retirarCardDaProgramacaoImpl);

/* ------------------------------ Retirar urgência --------------------------- */
// Pedido explícito do Felipe (01/08/2026): "para os cards classificados como
// URGÊNCIA, deve haver um botão de Retirar Urgência, para os casos em que o
// usuário entenda que não se trata mais de Urgência." Disponível direto nos
// 3 kanbans de Correção (ver CorrectionCardHeader), sem precisar abrir a
// tela Inspeções pra editar o item.
//
// Mesma semântica que editarSpotInspecaoImpl (apps/maintenance/src/app/
// actions/data.ts) já aplica ao desmarcar urgente sem resolver a NC: só
// cancela um pedido de bloqueio ainda PENDENTE (ver
// cancelarSolicitacaoBloqueioSeNecessario). De propósito NÃO desbloqueia uma
// UH que já tinha sido bloqueada por decisão do Atendimento — isso continua
// exigindo ação humana explícita em Seleção e Liberação ("Desbloquear"); só
// a resolução de fato da NC (resolveCorrectionCard) aciona o desbloqueio
// automático, ver desbloquearUHSeUltimaNcUrgenteResolvida em
// packages/core/src/maintenanceUrgente.ts. Mudar de ideia sobre a urgência
// não deve reverter sozinho uma decisão de bloqueio já tomada por outra
// pessoa.
async function retirarUrgenciaImpl(input: { cardId: string }) {
  const session = await requireModuleSession();
  const card = await getCardOrThrow(input.cardId, session.tenantId);

  const item = await prisma.maintenanceInspectionItem.findUnique({
    where: { id: card.inspectionItemId },
    select: { id: true, urgente: true },
  });
  if (!item || !item.urgente) {
    throw new Error("Este card não está marcado como urgente.");
  }

  await prisma.maintenanceInspectionItem.update({
    where: { id: item.id },
    data: { urgente: false },
  });

  await cancelarSolicitacaoBloqueioSeNecessario({ tenantId: session.tenantId, uhId: card.uhId });

  const { uhNumero, itemNome } = await nomesDoCard(card);
  await emitEvent({
    tenantId: session.tenantId,
    module: "MAINTENANCE",
    eventType: "maintenance.log.urgencia_retirada",
    entityType: "MaintenanceCorrectionCard",
    entityId: card.id,
    payload: { uhNumero, itemNome, atorNome: session.nome },
  });

  revalidatePath("/");
}
export const retirarUrgenciaAction = safeAction(retirarUrgenciaImpl);

/* --------------------------- Corrigir (atalho) ----------------------------- */
// Botão "Corrigir" disponível em Visão Gerencial, Inspeções e UH 3D — resolve
// a NC direto a partir do item de inspeção, sem depender de em que
// kanban/coluna o card de Correção dela esteja (ou mesmo sem card nenhum,
// caso de NC legada). Pedido explícito do Felipe: texto descritivo
// obrigatório, fotos opcionais. Ver corrigirItemDireto em
// packages/core/src/maintenanceCorrection.ts.

async function corrigirItemImpl(input: { inspectionItemId: string; description: string; photos: string[] }) {
  const session = await requireModuleSession();
  const description = input.description.trim();
  if (description.length < 5) throw new Error("Descreva o que foi feito (mínimo 5 caracteres).");

  await corrigirItemDireto({
    tenantId: session.tenantId,
    inspectionItemId: input.inspectionItemId,
    description,
    photos: input.photos ?? [],
    authorId: session.userId,
  });

  revalidatePath("/");
}
export const corrigirItemAction = safeAction(corrigirItemImpl);
