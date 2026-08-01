import { NextRequest, NextResponse } from "next/server";
import { prisma, getSession, sendPushToUser, emitEvent } from "@praxis/core";

// Portado de apps/housekeeping/src/app/api/bloqueio/route.ts (v1).
// Notificação via Telegram fica como TODO. DELETE (desbloquear, restrito a
// MASTER/GERENTE) fica pra quando a tela de gestão de UHs for portada.

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { uhId, uhNumero, motivo } = await req.json();

  if (!motivo?.trim()) {
    return NextResponse.json({ error: "Motivo obrigatório" }, { status: 400 });
  }
  if (!uhId && !uhNumero) {
    return NextResponse.json({ error: "uhId ou uhNumero obrigatório" }, { status: 400 });
  }

  const uh = await prisma.uH.findFirst({
    where: { tenantId: session.tenantId, ...(uhId ? { id: uhId } : { numero: uhNumero }) },
    select: { id: true, numero: true },
  });
  if (!uh) return NextResponse.json({ error: "UH não encontrada" }, { status: 404 });

  await prisma.uH.update({
    where: { id: uh.id },
    data: {
      bloqueada: true,
      bloqueioDescricao: motivo.trim(),
      bloqueioSolicitanteNome: session.nome,
      bloqueioEm: new Date(),
      // Distingue de um bloqueio decidido pelo Atendimento a partir de uma
      // NC urgente (bloqueioOrigem "DECISAO_ATENDIMENTO", ver
      // packages/core/src/maintenanceUrgente.ts e
      // api/decisao-bloqueio/route.ts) — só decorativo aqui, ambos usam o
      // mesmo desbloqueio manual (api/selecao-uhs, ação "desbloquear").
      bloqueioOrigem: "MANUAL",
      emManutencao: true,
      manutencaoDescricao: `🚨 BLOQUEIO: ${motivo.trim()}`,
    },
  });

  const usuarios = await prisma.user.findMany({
    where: { tenantId: session.tenantId, ativo: true },
    select: { id: true },
  });
  for (const u of usuarios) {
    await sendPushToUser(u.id, {
      title: "🚨 UH bloqueada",
      body: `UH ${uh.numero}: ${motivo.trim()}`,
      data: { tipo: "bloqueio", uhId: uh.id },
    });
  }

  // TODO: notificar via Telegram todos os usuários do tenant, quando o bot
  // for portado.

  await emitEvent({
    tenantId: session.tenantId,
    module: "HOUSEKEEPING",
    eventType: "housekeeping.log.bloqueio_manual_criado",
    entityType: "UH",
    entityId: uh.id,
    payload: { uhNumero: uh.numero, motivo: motivo.trim(), atorNome: session.nome },
  });

  return NextResponse.json({ ok: true });
}
