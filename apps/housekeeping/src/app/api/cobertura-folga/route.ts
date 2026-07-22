import { NextRequest, NextResponse } from "next/server";
import { getSession, prisma } from "@praxis/core";
import { dataAtualSP } from "@/lib/timezone";

// Portado de apps/housekeeping/src/app/api/cobertura-folga/route.ts (v1) —
// só o GET por enquanto (consulta se há cobertura ativa num dia, usado pelo
// banner "Você está de folga hoje" na tela de Atribuição). POST/DELETE
// (criar/cancelar cobertura, com link tokenizado + notificação Telegram pra
// substituta) ficam pra uma fatia futura — sem eles, o fluxo de atribuição
// funciona normalmente, só não existe ainda a tela de configurar a folga.

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Leitura sempre liberada, mesmo sem acesso ao módulo (ver comentário em
  // apps/maintenance/src/app/page.tsx) — esta rota é só de leitura.
  const tenantId = session.tenantId;
  const hoje = dataAtualSP();

  const data = req.nextUrl.searchParams.get("data") || hoje;
  const cobertura = await prisma.coberturaFolga.findUnique({
    where: { tenantId_data: { tenantId, data } },
    select: { id: true, data: true, governantaId: true, substitutaId: true },
  });

  if (!cobertura) return NextResponse.json(null);

  const [governanta, substituta] = await Promise.all([
    prisma.user.findUnique({ where: { id: cobertura.governantaId }, select: { nome: true } }),
    prisma.user.findUnique({ where: { id: cobertura.substitutaId }, select: { nome: true } }),
  ]);

  return NextResponse.json({ ...cobertura, governantaNome: governanta?.nome, substitutaNome: substituta?.nome });
}
