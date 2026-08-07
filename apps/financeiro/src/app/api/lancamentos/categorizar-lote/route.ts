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

  // Categoria de Receita não pode ir num lançamento de Despesa (nem
  // vice-versa) — pedido do Felipe, 07/08/2026: "O sistema n deve nem
  // permitir categorias de receitas associadas a despesas e vice versa".
  // Um grupo (mesmo fornecedor/descrição) normalmente tem o MESMO sinal em
  // todas as ocorrências, mas não é garantido — o filtro de valor abaixo só
  // aplica a categoria aos lançamentos do grupo cujo sinal bate com o tipo
  // da categoria escolhida; o resto fica de fora (reportado em `ignorados`),
  // nunca é forçado pra um tipo errado.
  const filtroValor = categoria.tipo === "RECEITA" ? { gt: 0 } : { lt: 0 };
  const baseWhere = {
    tenantId: session.tenantId,
    categoriaId: null,
    ...(tipo === "fornecedor" ? { fornecedor: chave } : { descricao: chave }),
  };

  const [{ count }, ignorados] = await Promise.all([
    prisma.financeLancamento.updateMany({ where: { ...baseWhere, valor: filtroValor }, data: { categoriaId } }),
    prisma.financeLancamento.count({ where: { ...baseWhere, NOT: { valor: filtroValor } } }),
  ]);

  return NextResponse.json({ atualizados: count, ignorados });
}
