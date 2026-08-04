import { prisma } from "./prisma";
import { notificarPorRoles } from "./notify";
import { sendPushToUser } from "./push";
import { createCorrectionCardForItem } from "./maintenanceCorrection";
import { dataAtualSP } from "./timezone";
import { emitEvent } from "./aiEvents";

// NC (não conformidade) "impeditiva ao uso" / urgente — pedido explícito do
// Felipe: "vamos remover o bloqueio automático para manutenção. O bloqueio
// de manutenção deve ser feito sem ser de forma automática e deverá ser
// atribuição do atendimento." Registrar uma NC como urgente NÃO bloqueia
// mais a UH sozinho — cria um HkBlockRequest PENDENTE e notifica Gerente/
// Atendimento/Governanta/Master; cabe ao Atendimento (ou Gerente/Master)
// decidir bloquear ou não, na tela de Decisão de Bloqueio
// (apps/housekeeping/src/app/decisao-bloqueio). Chamado dos mesmos 4 pontos
// de entrada de NC de sempre (inspeção completa, spot UH 3D, camareira,
// governanta).
//
// Se já existe um pedido PENDENTE pra mesma UH, não cria outro (evita
// empilhar) — só reenvia a notificação, pro caso de alguém ter perdido a
// primeira.
export async function aplicarBloqueioPorUrgencia(params: {
  tenantId: string;
  uhId: string;
  checklistItemId: string | null;
  comment: string;
  solicitanteNome: string;
}) {
  const uh = await prisma.uH.findUnique({
    where: { id: params.uhId },
    select: { numero: true, tenantId: true },
  });
  if (!uh || uh.tenantId !== params.tenantId) return;

  const jaPendente = await prisma.hkBlockRequest.findFirst({
    where: { tenantId: params.tenantId, uhId: params.uhId, status: "PENDENTE" },
    select: { id: true },
  });

  const checklistItem = params.checklistItemId
    ? await prisma.maintenanceChecklistItem.findUnique({
        where: { id: params.checklistItemId },
        select: { name: true },
      })
    : null;

  if (!jaPendente) {
    await prisma.hkBlockRequest.create({
      data: {
        tenantId: params.tenantId,
        uhId: params.uhId,
        checklistItemId: params.checklistItemId,
        itemNome: checklistItem?.name ?? null,
        comment: params.comment,
        solicitanteNome: params.solicitanteNome,
      },
    });
  }

  await notificarPorRoles(params.tenantId, ["ATENDIMENTO", "GERENTE", "GOVERNANTA", "MASTER"], {
    title: "🚨 Não conformidade urgente — decisão de bloqueio pendente",
    body: `UH ${uh.numero}${checklistItem ? ` — ${checklistItem.name}` : ""}: ${params.comment}`,
    data: { view: "decisao-bloqueio", uhId: params.uhId },
  });

  await emitEvent({
    tenantId: params.tenantId,
    module: "MAINTENANCE",
    eventType: "maintenance.uh.solicitacao_bloqueio",
    entityType: "UH",
    entityId: params.uhId,
    payload: { checklistItemId: params.checklistItemId, comment: params.comment },
  });
}

// Chamado sempre que uma NC urgente é resolvida ou deixa de ser urgente,
// ANTES de o Atendimento ter decidido — cancela o(s) pedido(s) PENDENTE(s)
// dessa UH, já que não há mais decisão a tomar (o problema sumiu sozinho).
//
// Diferente da versão anterior (reavaliarBloqueioUrgencia), esta função NÃO
// mexe em UH.bloqueada: desde que o bloqueio virou decisão humana do
// Atendimento, só o próprio Atendimento remove um bloqueio já aplicado (ver
// ação "desbloquear" em apps/housekeeping/src/app/api/decisao-bloqueio) —
// mesmo que a NC que motivou o pedido já tenha sido corrigida.
export async function cancelarSolicitacaoBloqueioSeNecessario(params: { tenantId: string; uhId: string }) {
  await prisma.hkBlockRequest.updateMany({
    where: { tenantId: params.tenantId, uhId: params.uhId, status: "PENDENTE" },
    data: { status: "CANCELADO", decididoEm: new Date() },
  });
}

// Pedido explícito do Felipe: "Caso a UH esteja bloqueada por alguma NC
// específica, ao concluir o serviço e dar baixa, a UH deve ser
// automaticamente liberada." Chamado de resolveCorrectionCard/
// corrigirItemDireto sempre que um item URGENTE é resolvido — só um item
// urgente pode ter gerado um bloqueio via decisão do Atendimento (ver
// aplicarBloqueioPorUrgencia).
//
// Só desbloqueia quando:
//   - a UH está de fato bloqueada;
//   - a origem foi DECISAO_ATENDIMENTO (bloqueio manual via api/bloqueio,
//     bloqueioOrigem="MANUAL", não tem NC específica associada — não é "a
//     UH bloqueada por alguma NC específica" do pedido do Felipe, fica fora,
//     continua exigindo desbloqueio manual);
//   - não sobra nenhuma OUTRA NC urgente ainda aberta nessa UH (senão
//     desbloquearia com outro problema urgente ainda pendente).
//
// Diferente de cancelarSolicitacaoBloqueioSeNecessario (que só cancela
// pedidos ainda PENDENTES, antes de qualquer decisão humana) — esta função
// mexe em UH.bloqueada de um bloqueio JÁ APLICADO, decisão explícita desta
// mudança de comportamento pedida pelo Felipe.
export async function desbloquearUHSeUltimaNcUrgenteResolvida(params: { tenantId: string; uhId: string }) {
  const uh = await prisma.uH.findUnique({
    where: { id: params.uhId },
    select: { numero: true, bloqueada: true, bloqueioOrigem: true },
  });
  if (!uh || !uh.bloqueada || uh.bloqueioOrigem !== "DECISAO_ATENDIMENTO") return;

  const outraNcUrgenteAberta = await prisma.maintenanceInspectionItem.findFirst({
    where: {
      status: "NAO_CONFORME",
      urgente: true,
      inspection: { tenantId: params.tenantId, uhId: params.uhId },
    },
    select: { id: true },
  });
  if (outraNcUrgenteAberta) return;

  await prisma.uH.update({
    where: { id: params.uhId },
    data: {
      bloqueada: false,
      bloqueioDescricao: null,
      bloqueioSolicitanteNome: null,
      bloqueioEm: null,
      bloqueioOrigem: null,
    },
  });

  await notificarPorRoles(params.tenantId, ["GOVERNANTA", "GERENTE", "MASTER", "ATENDIMENTO"], {
    title: "🔓 UH liberada automaticamente",
    body: `UH ${uh.numero} foi liberada — a manutenção que motivou o bloqueio foi concluída.`,
    data: { tipo: "desbloqueio_automatico", uhId: params.uhId },
  });
}

// NÃO CHAMADA ATUALMENTE — api/selecao-uhs (action toggle_manutencao) foi
// revertido pra chamar ativarManutencaoUH direto, sem etapa de pendência
// (pedido explícito do Felipe: "o registro de manutenção pela tela seleção e
// liberação não deve exigir aprovação"). Deixada aqui (junto com o suporte a
// HkBlockRequest.tipo="MANUTENCAO" em decisao-bloqueio/route.ts) porque esse
// comportamento já foi pedido e revertido mais de uma vez neste projeto —
// mais barato manter a função pronta do que recriar se Felipe pedir de volta.
export async function criarSolicitacaoManutencao(params: {
  tenantId: string;
  uhId: string;
  checklistItemId: string;
  descricao: string;
  solicitanteNome: string;
}) {
  const uh = await prisma.uH.findUnique({
    where: { id: params.uhId },
    select: { numero: true, tenantId: true },
  });
  if (!uh || uh.tenantId !== params.tenantId) return;

  // Pedido explícito do Felipe: "Todo defeito de manutenção aberto na tela
  // de seleção e liberação deve ser associado a algum item real daquela UH
  // presente no cadastro do módulo de manutenção." Antes disso, essa flag
  // criava um MaintenanceInspectionItem com checklistItemId=null (nunca
  // vinculado a nenhum item do catálogo) — o que fazia a tela de Correção
  // exibir "Item removido do catálogo" pra um item que, na verdade, nunca
  // tinha sido excluído: simplesmente nunca existiu vínculo nenhum. Ver
  // itemNome abaixo — mesmo snapshot já usado por aplicarBloqueioPorUrgencia.
  const checklistItem = await prisma.maintenanceChecklistItem.findUnique({
    where: { id: params.checklistItemId },
    select: { id: true, tenantId: true, name: true },
  });
  if (!checklistItem || checklistItem.tenantId !== params.tenantId) {
    throw new Error("Item de checklist inválido.");
  }

  const jaPendente = await prisma.hkBlockRequest.findFirst({
    where: { tenantId: params.tenantId, uhId: params.uhId, status: "PENDENTE", tipo: "MANUTENCAO" },
    select: { id: true },
  });

  if (!jaPendente) {
    await prisma.hkBlockRequest.create({
      data: {
        tenantId: params.tenantId,
        uhId: params.uhId,
        tipo: "MANUTENCAO",
        checklistItemId: checklistItem.id,
        itemNome: checklistItem.name,
        comment: params.descricao,
        solicitanteNome: params.solicitanteNome,
      },
    });
  }

  await notificarPorRoles(params.tenantId, ["ATENDIMENTO", "GERENTE", "GOVERNANTA", "MASTER"], {
    title: "🔧 Solicitação de manutenção — decisão pendente",
    body: `UH ${uh.numero}: ${params.descricao}`,
    data: { view: "decisao-bloqueio", uhId: params.uhId },
  });

  await emitEvent({
    tenantId: params.tenantId,
    module: "MAINTENANCE",
    eventType: "maintenance.uh.solicitacao_manutencao",
    entityType: "UH",
    entityId: params.uhId,
    payload: { comment: params.descricao },
  });
}

// Chamado DIRETO por api/selecao-uhs (action toggle_manutencao) quando
// alguém liga a flag de Manutenção de uma UH — pedido explícito do Felipe:
// "o registro de manutenção pela tela seleção e liberação não deve exigir
// aprovação. Normalmente é o atendimento que registra, então já deve
// transformar o item para não-conforme." Sem etapa de aprovação/pendência
// nenhuma (diferente do fluxo de NC urgente/bloqueio, que continua passando
// pela Decisão de Bloqueio — isso não mudou, só o de Manutenção).
//
// Liga UH.emManutencao, troca o programa do dia (ARRUMACAO ou
// ARRUMACAO_SIMPLES) → LIMPEZA_COMPLETA se for o caso, notifica a camareira
// atribuída e Governanta/Gerente/Master,
// e sensibiliza o módulo de Manutenção: marca o item real do checklist,
// escolhido na Seleção e Liberação, como NAO_CONFORME e cria o card de
// Correção já em "A Processar" (needsMaterial/needsExternalService ainda
// null — só a triagem de aquisição/serviço externo fica pendente, não a
// não-conformidade em si), com dedupe contra card já aberto pro mesmo item.
// `solicitanteNome`/`registradoPorId` aqui são a mesma pessoa que registrou
// (fica salvo em UH.manutencaoSolicitanteNome, pra exibir "quem registrou e
// quando" na tela).
export async function ativarManutencaoUH(params: {
  tenantId: string;
  uhId: string;
  checklistItemId: string;
  descricao: string;
  solicitanteNome: string;
  registradoPorId: string;
  // Pedido explícito do Felipe (04/08/2026): esse atalho passou a perguntar
  // as duas flags também, igual aos outros pontos de entrada de NC — antes
  // o item nascia sempre urgente=false/prioridade=false por padrão do
  // schema, sem perguntar nada.
  urgente: boolean;
  prioridade: boolean;
}) {
  const { tenantId, uhId, checklistItemId, descricao, solicitanteNome, registradoPorId, urgente, prioridade } = params;

  const uh = await prisma.uH.findUnique({ where: { id: uhId }, select: { numero: true } });
  if (!uh) return;

  await prisma.uH.update({
    where: { id: uhId },
    data: {
      emManutencao: true,
      manutencaoDescricao: descricao,
      manutencaoSolicitanteNome: solicitanteNome,
      manutencaoEm: new Date(),
    },
  });

  const data = dataAtualSP();

  const [assignment, programaLimpezaEspecifica] = await Promise.all([
    prisma.dailyAssignment.findFirst({
      where: { tenantId, data, uhId },
      include: { program: { select: { id: true, tipo: true } } },
    }),
    prisma.cleaningProgram.findFirst({ where: { tenantId, tipo: "LIMPEZA_COMPLETA" } }),
  ]);

  // Cobre os dois tipos "normais" de arrumação (detalhada e simples — ver
  // CleaningProgram.tipo no schema) — nenhum dos dois deve continuar
  // atribuído a uma UH que acabou de entrar em manutenção, pedido do Felipe
  // (04/08/2026) de estender essa troca automática pra Arrumação Simples
  // também, não só a detalhada original.
  if (assignment && ["ARRUMACAO", "ARRUMACAO_SIMPLES"].includes(assignment.program?.tipo ?? "") && programaLimpezaEspecifica) {
    await prisma.dailyAssignment.update({
      where: { id: assignment.id },
      data: { programId: programaLimpezaEspecifica.id },
    });
  }

  if (assignment) {
    await sendPushToUser(assignment.camareiraId, {
      title: "UH em manutenção",
      body: `UH ${uh.numero} entrou em manutenção: ${descricao}`,
      data: { tipo: "uh_manutencao", uhId, data },
    });
  }

  await notificarPorRoles(tenantId, ["GOVERNANTA", "GERENTE", "MASTER"], {
    title: "UH em manutenção",
    body: `UH ${uh.numero} entrou em manutenção.`,
    data: { tipo: "uh_manutencao", uhId, data },
  });

  // Dedupe pelo item REAL escolhido (não mais um "item genérico" com
  // checklistItemId null) — mesmo padrão de carryover usado em
  // createInspecaoImpl: se esse item específico já tem um card de Correção
  // em aberto (ainda NAO_CONFORME) pra essa UH, não duplica.
  const cardJaAberto = await prisma.maintenanceCorrectionCard.findFirst({
    where: {
      tenantId,
      uhId,
      checklistItemId,
      inspectionItem: { status: "NAO_CONFORME" },
    },
    select: { id: true },
  });

  if (!cardJaAberto) {
    const descricaoFlag = descricao?.trim() || "UH marcada em manutenção na tela Seleção e Liberação.";

    // Pedido explícito do Felipe: o item real da UH precisa virar
    // Não Conforme de verdade (mesmo model MaintenanceInspectionItem usado
    // pela Rota de Inspeção) — não é mais um item "solto" sem vínculo com o
    // cadastro de Manutenção.
    const ultimaInspecaoManut = await prisma.maintenanceInspection.findFirst({
      where: { tenantId, uhId },
      orderBy: { date: "desc" },
      select: { id: true },
    });

    let inspectionItemId: string;

    if (ultimaInspecaoManut) {
      const novoItem = await prisma.maintenanceInspectionItem.create({
        data: {
          inspectionId: ultimaInspecaoManut.id,
          checklistItemId,
          status: "NAO_CONFORME",
          comment: descricaoFlag,
          urgente,
          prioridade,
        },
      });
      inspectionItemId = novoItem.id;
    } else {
      const novaInspecao = await prisma.maintenanceInspection.create({
        data: {
          tenantId,
          uhId,
          inspectorId: registradoPorId,
          date: new Date(),
          // avulsa=true: essa Inspeção nasceu só pra pendurar o relato da
          // flag de Manutenção, não é uma Rota de Inspeção completa — não
          // deve contar como "UH inspecionada" pro prazo de conformidade
          // (ver comentário no schema, MaintenanceInspection.avulsa).
          avulsa: true,
          items: { create: [{ checklistItemId, status: "NAO_CONFORME", comment: descricaoFlag, urgente, prioridade }] },
        },
        include: { items: true },
      });
      inspectionItemId = novaInspecao.items[0].id;
    }

    await createCorrectionCardForItem({
      tenantId,
      inspectionItemId,
      uhId,
      checklistItemId,
      needsMaterial: null,
      needsExternalService: null,
      triagedById: null,
    });

    await notificarPorRoles(tenantId, ["MANUTENCAO", "GERENTE", "GOVERNANTA"], {
      title: "🔧 Necessidade de manutenção registrada",
      body: `UH ${uh.numero}: ${descricaoFlag}`,
      data: { view: "correcao" },
    });

    // Mesmo tratamento dos outros pontos de entrada de NC — se marcada como
    // urgente aqui, também dispara o pedido de bloqueio pro Atendimento
    // decidir (ver aplicarBloqueioPorUrgencia).
    if (urgente) {
      await aplicarBloqueioPorUrgencia({
        tenantId,
        uhId,
        checklistItemId,
        comment: descricaoFlag,
        solicitanteNome,
      });
    }
  }
}
