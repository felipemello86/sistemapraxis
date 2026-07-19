import { NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// GET /api/estoque-produtos — lista produtos ativos do Estoque pra vincular
// itens do cardápio (select da tela de Configurações).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "RESTAURANT"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const produtos = await prisma.stockProduct.findMany({
    where: { tenantId: session.tenantId, ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, unidade: true, quantidade: true, categoria: true },
  });
  return NextResponse.json(produtos);
}
