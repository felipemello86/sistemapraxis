import { prisma } from "./prisma";
import { notificarTodosDoTenant } from "./notify";
import { emitEvent } from "./aiEvents";

// NC (não conformidade) "impeditiva ao uso" / urgente — pedido explícito do
// Felipe: registrar como urgente deve (1) bloquear a UH pra reservas
// (reaproveita UH.bloqueada, já existente — ver
// apps/housekeeping/src/app/api/bloqueio/route.ts, o bloqueio manual da
// Camareira) e (2) notificar todos os usuários do tenant. Chamado dos 4
// pontos de entrada de NC (inspeção completa, spot UH 3D, camareira,
// governanta) sempre que um item passa a ter urgente=true e ainda não
// tinha (evita re-notificar todo dia por um item que segue urgente).
//
// UH.bloqueadaOrigem distingue esse bloqueio automático do bloqueio manual
// (mesmo campo uh.bloqueada, dois jeitos de chegar lá) — importante pra
// reavaliarBloqueioUrgencia (auto-desbloqueio) nunca derrubar um bloqueio
// que foi pedido manualmente por outro motivo.
export async function aplicarBloqueioPorUrgencia(params: {
  tenantId: string;
  uhId: string;
  checklistItemId: string | null;
  comment: string;
  solicitanteNome: string;
}) {
  const uh = await prisma.uH.findUnique({
    where: { id: params.uhId },
    select: { numero: true, bloqueada: true, tenantId: true },
  });
  if (!uh || uh.tenantId !== params.tenantId) return;

  // Só escreve os campos de bloqueio se a UH ainda não estava bloqueada —
  // não sobrescreve a descrição/solicitante de um bloqueio (manual ou de
  // outra NC urgente) que já estava em vigor.
  if (!uh.bloqueada) {
    await prisma.uH.update({
      where: { id: params.uhId },
      data: {
        bloqueada: true,
        bloqueioDescricao: params.comment,
        bloqueioSolicitanteNome: params.solicitanteNome,
        bloqueioEm: new Date(),
        bloqueioOrigem: "NC_URGENTE",
      },
    });
  }

  const checklistItem = params.checklistItemId
    ? await prisma.maintenanceChecklistItem.findUnique({
        where: { id: params.checklistItemId },
        select: { name: true },
      })
    : null;

  await notificarTodosDoTenant(params.tenantId, {
    title: "🚨 Não conformidade urgente registrada",
    body: `UH ${uh.numero}${checklistItem ? ` — ${checklistItem.name}` : ""}: ${params.comment}`,
    data: { view: "uh3d", uhId: params.uhId },
  });

  await emitEvent({
    tenantId: params.tenantId,
    module: "MAINTENANCE",
    eventType: "maintenance.uh.bloqueio_urgente",
    entityType: "UH",
    entityId: params.uhId,
    payload: { checklistItemId: params.checklistItemId, comment: params.comment },
  });
}

// Chamado sempre que uma NC urgente é resolvida ou deixa de ser urgente —
// desbloqueia a UH automaticamente SE (a) o bloqueio atual foi originado
// por NC urgente (não mexe em bloqueio manual) e (b) não sobra nenhuma
// outra NC urgente em aberto pra essa UH.
export async function reavaliarBloqueioUrgencia(params: { tenantId: string; uhId: string }) {
  const uh = await prisma.uH.findUnique({
    where: { id: params.uhId },
    select: { bloqueada: true, bloqueioOrigem: true, tenantId: true },
  });
  if (!uh || uh.tenantId !== params.tenantId) return;
  if (!uh.bloqueada || uh.bloqueioOrigem !== "NC_URGENTE") return;

  const aindaTemUrgente = await prisma.maintenanceInspectionItem.count({
    where: {
      status: "NAO_CONFORME",
      urgente: true,
      inspection: { uhId: params.uhId, tenantId: params.tenantId },
    },
  });
  if (aindaTemUrgente > 0) return;

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

  await emitEvent({
    tenantId: params.tenantId,
    module: "MAINTENANCE",
    eventType: "maintenance.uh.desbloqueio_urgente",
    entityType: "UH",
    entityId: params.uhId,
  });
}
