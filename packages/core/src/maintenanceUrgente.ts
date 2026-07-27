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

// Mesmo padrão de aplicarBloqueioPorUrgencia, mas pro segundo tipo de pedido
// desta tela (HkBlockRequest.tipo="MANUTENCAO") — pedido explícito do Felipe:
// "toda Manutenção não deve ser automaticamente bloqueada pelo módulo
// manutenção. Deve ser direcionado uma solicitação para o atendimento
// processar." Chamado de api/selecao-uhs (action toggle_manutencao) quando
// alguém marca uma UH como "Em Manutenção" — em vez de ligar a flag na hora,
// cria um pedido PENDENTE que só o Atendimento (ou Gerente/Master) decide na
// tela de Decisão de Bloqueio (mesma tela do tipo BLOQUEIO, decisão
// explícita do Felipe de reaproveitar em vez de criar uma nova).
export async function criarSolicitacaoManutencao(params: {
  tenantId: string;
  uhId: string;
  descricao: string;
  solicitanteNome: string;
}) {
  const uh = await prisma.uH.findUnique({
    where: { id: params.uhId },
    select: { numero: true, tenantId: true },
  });
  if (!uh || uh.tenantId !== params.tenantId) return;

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

// Chamado quando o Atendimento (ou Gerente/Master) APROVA um pedido
// tipo=MANUTENCAO na tela de Decisão de Bloqueio. Faz o que
// api/selecao-uhs/toggle_manutencao fazia direto antes desta mudança: liga
// UH.emManutencao, troca o programa do dia ARRUMACAO→LIMPEZA_COMPLETA se for
// o caso, notifica a camareira atribuída e Governanta/Gerente/Master, e
// sensibiliza o módulo de Manutenção (cria MaintenanceInspectionItem + card
// de Correção em "A Processar", com o mesmo dedupe contra item genérico já
// aberto pra essa UH). `solicitanteNome` aqui é quem PEDIU a manutenção
// (fica salvo em UH.manutencaoSolicitanteNome, pra exibir "quem pediu e
// quando" na tela) — diferente de quem aprovou, que fica em
// HkBlockRequest.decididoPorNome.
export async function ativarManutencaoUH(params: {
  tenantId: string;
  uhId: string;
  descricao: string;
  solicitanteNome: string;
  aprovadoPorId: string;
}) {
  const { tenantId, uhId, descricao, solicitanteNome, aprovadoPorId } = params;

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

  if (assignment && assignment.program?.tipo === "ARRUMACAO" && programaLimpezaEspecifica) {
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

  const ultimaInspecaoManut = await prisma.maintenanceInspection.findFirst({
    where: { tenantId, uhId },
    orderBy: { date: "desc" },
    include: { items: { where: { checklistItemId: null } } },
  });
  const itemGenericoAberto = ultimaInspecaoManut?.items.find((it) => it.status === "NAO_CONFORME");

  if (!itemGenericoAberto) {
    const descricaoFlag = descricao?.trim() || "UH marcada em manutenção na tela Seleção e Liberação.";
    let inspectionItemId: string;

    if (ultimaInspecaoManut) {
      const novoItem = await prisma.maintenanceInspectionItem.create({
        data: {
          inspectionId: ultimaInspecaoManut.id,
          checklistItemId: null,
          status: "NAO_CONFORME",
          comment: descricaoFlag,
        },
      });
      inspectionItemId = novoItem.id;
    } else {
      const novaInspecao = await prisma.maintenanceInspection.create({
        data: {
          tenantId,
          uhId,
          inspectorId: aprovadoPorId,
          date: new Date(),
          items: { create: [{ checklistItemId: null, status: "NAO_CONFORME", comment: descricaoFlag }] },
        },
        include: { items: true },
      });
      inspectionItemId = novaInspecao.items[0].id;
    }

    await createCorrectionCardForItem({
      tenantId,
      inspectionItemId,
      uhId,
      checklistItemId: null,
      needsMaterial: null,
      needsExternalService: null,
      triagedById: null,
    });

    await notificarPorRoles(tenantId, ["MANUTENCAO", "GERENTE", "GOVERNANTA"], {
      title: "🔧 Necessidade de manutenção registrada",
      body: `UH ${uh.numero}: ${descricaoFlag}`,
      data: { view: "correcao" },
    });
  }
}
