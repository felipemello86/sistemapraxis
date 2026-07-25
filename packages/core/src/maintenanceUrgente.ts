import { prisma } from "./prisma";
import { notificarPorRoles } from "./notify";
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
