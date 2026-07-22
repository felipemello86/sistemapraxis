import { NextResponse } from "next/server";
import { getSession, prisma } from "@praxis/core";

// Portado de apps/housekeeping/src/app/api/relatorios/route.ts (v1).
// GET /api/relatorios — lista datas com assignments, descrescente
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Leitura sempre liberada, mesmo sem acesso ao módulo (ver comentário em
  // apps/maintenance/src/app/page.tsx) — esta rota é só de leitura.

  const rows = await prisma.dailyAssignment.groupBy({
    by: ["data"],
    where: { tenantId: session.tenantId },
    _count: { id: true },
    orderBy: { data: "desc" },
  });

  const datas = rows.map((r) => ({
    data: r.data,
    totalUHs: r._count.id,
  }));

  return NextResponse.json(datas);
}
