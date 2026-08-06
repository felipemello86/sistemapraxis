import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// GET /api/orcamento/provisoes?categoriaId=xxx&meses=2026-09,2026-10,...
//
// Endpoint leve (pedido do Felipe, 06/08/2026, fluxo de replicação da
// provisão): antes de replicar o valor de uma provisão pros meses
// seguintes, a tela precisa saber QUAIS desses meses já têm um valor
// configurado pra essa categoria, pra perguntar se deve sobrescrever. Só
// retorna os que EXISTEM (mes -> valor) — não calcula a árvore inteira do
// Orçamento pra cada mês, só consulta a tabela crua.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const categoriaId = searchParams.get("categoriaId");
  const mesesParam = searchParams.get("meses");
  if (!categoriaId) return NextResponse.json({ error: "categoriaId obrigatório" }, { status: 400 });
  if (!mesesParam) return NextResponse.json({ error: "meses obrigatório (lista separada por vírgula)" }, { status: 400 });

  const meses = mesesParam.split(",").filter(Boolean);
  for (const m of meses) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return NextResponse.json({ error: `Mês inválido: "${m}"` }, { status: 400 });
  }
  if (meses.length === 0) return NextResponse.json({});

  const existentes = await prisma.financeOrcamento.findMany({
    where: { tenantId: session.tenantId, alvoTipo: "CATEGORIA", alvoChave: categoriaId, mes: { in: meses } },
    select: { mes: true, valor: true },
  });

  return NextResponse.json(Object.fromEntries(existentes.map((o) => [o.mes, o.valor])));
}
