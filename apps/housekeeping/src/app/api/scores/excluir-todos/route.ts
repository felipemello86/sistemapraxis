import { NextRequest, NextResponse } from "next/server";
import { getSession, prisma } from "@praxis/core";

// Portado de apps/housekeeping/src/app/api/scores/excluir-todos/route.ts (v1).
// PATCH /api/scores/excluir-todos { camareiraId, excluir: boolean }
// MASTER only — exclui (ou reinclui) TODAS as sessões de uma camareira
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "MASTER") return NextResponse.json({ error: "MASTER only" }, { status: 403 });

  const tenantId = session.tenantId;
  const { camareiraId, excluir } = await req.json();
  if (!camareiraId || typeof excluir !== "boolean") {
    return NextResponse.json({ error: "camareiraId e excluir são obrigatórios" }, { status: 400 });
  }

  // Garante que a camareira pertence ao tenant
  const camareira = await prisma.user.findFirst({
    where: { id: camareiraId, tenantId, role: "CAMAREIRA" },
    select: { id: true, nome: true },
  });
  if (!camareira) return NextResponse.json({ error: "Camareira não encontrada" }, { status: 404 });

  const { count } = await prisma.cleaningSession.updateMany({
    where: { camareiraId, camareira: { tenantId } },
    data: { excluidoDoScore: excluir },
  });

  return NextResponse.json({ ok: true, sessoes: count, nome: camareira.nome });
}
