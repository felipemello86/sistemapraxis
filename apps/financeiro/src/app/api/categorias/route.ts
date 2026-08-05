import { NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Catálogo de categorias do tenant — alimenta os seletores de categoria em
// Lançamentos, Orçamento e na tela de "pendentes de categorização" da DRE.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const categorias = await prisma.financeCategoria.findMany({
    where: { tenantId: session.tenantId, ativo: true },
    orderBy: [{ bloco: "asc" }, { ordem: "asc" }],
  });

  return NextResponse.json(categorias);
}
