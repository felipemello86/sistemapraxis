import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Aplica uma categoria a TODOS os lançamentos pendentes (categoriaId=null)
// que batem com um grupo de /api/lancamentos/pendentes-agrupados — mesma
// chave (fornecedor ou descrição). Só mexe em pendentes de propósito: não
// reclassifica lançamento que a pessoa já categorizou manualmente antes,
// mesmo que tenha a mesma descrição.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { tipo, chave, categoriaId } = await req.json();
  if (tipo !== "fornecedor" && tipo !== "descricao") {
    return NextResponse.json({ error: "tipo deve ser fornecedor ou descricao" }, { status: 400 });
  }
  if (!chave) return NextResponse.json({ error: "chave é obrigatória" }, { status: 400 });
  if (!categoriaId) return NextResponse.json({ error: "categoriaId é obrigatória" }, { status: 400 });

  const categoria = await prisma.financeCategoria.findUnique({ where: { id: categoriaId } });
  if (!categoria || categoria.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
  }

  const { count } = await prisma.financeLancamento.updateMany({
    where: {
      tenantId: session.tenantId,
      categoriaId: null,
      ...(tipo === "fornecedor" ? { fornecedor: chave } : { descricao: chave }),
    },
    data: { categoriaId },
  });

  return NextResponse.json({ atualizados: count });
}
