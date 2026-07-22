import { NextRequest, NextResponse } from "next/server";
import { getSession, prisma } from "@praxis/core";

// GET /api/queixas?id=... — detalhe completo de uma queixa de hóspede
// (título, descrição, anexos, penalidade). Usado pelo QueixaDetailModal,
// aberto ao clicar no balão "Queixa(s)" em Seleção e Liberação ou na linha
// de queixa no detalhe da camareira em Performance.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Leitura sempre liberada, mesmo sem acesso ao módulo (ver comentário em
  // apps/maintenance/src/app/page.tsx) — esta rota é só de leitura.
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const q = await prisma.guestComplaint.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      uh: { select: { numero: true } },
      camareira: { select: { nome: true } },
    },
  });
  if (!q) return NextResponse.json({ error: "Queixa não encontrada" }, { status: 404 });

  let anexos: { url: string; fileName: string; fileSize?: number }[] = [];
  try {
    anexos = JSON.parse(q.anexos);
  } catch {
    anexos = [];
  }

  return NextResponse.json({
    id: q.id,
    titulo: q.titulo,
    tipo: q.tipo,
    descricao: q.descricao,
    data: q.data,
    uhNumero: q.uh.numero,
    camareiraNome: q.camareira?.nome ?? null,
    pontosDescontados: q.pontosDescontados,
    registradoPorNome: q.registradoPorNome,
    anexos,
    createdAt: q.createdAt,
  });
}
