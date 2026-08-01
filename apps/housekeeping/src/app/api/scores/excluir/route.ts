import { NextRequest, NextResponse } from "next/server";
import { emitEvent, getSession, prisma } from "@praxis/core";

// Portado de apps/housekeeping/src/app/api/scores/excluir/route.ts (v1).
// PATCH /api/scores/excluir  body: { sessaoId }
// Alterna excluidoDoScore (toggle). Apenas MASTER.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "MASTER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { sessaoId } = await req.json();
  if (!sessaoId) return NextResponse.json({ error: "sessaoId required" }, { status: 400 });

  const atual = await prisma.cleaningSession.findUnique({
    where: { id: sessaoId },
    select: {
      excluidoDoScore: true,
      uh: { select: { numero: true } },
      camareira: { select: { nome: true, tenantId: true } },
    },
  });
  if (!atual) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const atualizado = await prisma.cleaningSession.update({
    where: { id: sessaoId },
    data: { excluidoDoScore: !atual.excluidoDoScore },
    select: { id: true, excluidoDoScore: true },
  });

  await emitEvent({
    tenantId: atual.camareira.tenantId,
    module: "HOUSEKEEPING",
    eventType: "housekeeping.log.score_sessao_alterado",
    entityType: "CleaningSession",
    entityId: sessaoId,
    payload: {
      uhNumero: atual.uh.numero,
      camareiraNome: atual.camareira.nome,
      excluidoDoScore: atualizado.excluidoDoScore,
      atorNome: session.nome,
    },
  });

  return NextResponse.json(atualizado);
}
