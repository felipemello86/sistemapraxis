import { NextResponse } from "next/server";
import { getSession, hasModuleAccess, calcularDre, dataAtualSP, mesAdjacente, type FiltroCentroCusto } from "@praxis/core";

// Calcula a DRE de um mês (?mes=YYYY-MM, default: mês atual) — passado,
// atual ou futuro, mesma função pras três situações (requisito 2 do
// Felipe). Ver lib/finance/dre.ts em @praxis/core pra fórmula e regras de
// projeção de recorrência.
//
// Centro de Custo (pedido do Felipe, 05/08/2026): ?centroCusto=GERAL
// (default) | EMPREENDIMENTO&empreendimentoId=xxx | UNIDADE&unidadeId=xxx —
// filtra e rateia os lançamentos conforme lib/finance/centro-de-custo.ts.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const mes = searchParams.get("mes") ?? dataAtualSP().slice(0, 7);

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    return NextResponse.json({ error: `Mês inválido: "${mes}" (esperado YYYY-MM)` }, { status: 400 });
  }

  const centroCustoTipo = searchParams.get("centroCusto") ?? "GERAL";
  let filtroCentroCusto: FiltroCentroCusto;
  if (centroCustoTipo === "EMPREENDIMENTO") {
    const propertyId = searchParams.get("empreendimentoId"); // nome do query param mantido (compat com a UI atual)
    if (!propertyId) return NextResponse.json({ error: "empreendimentoId é obrigatório quando centroCusto=EMPREENDIMENTO" }, { status: 400 });
    filtroCentroCusto = { tipo: "EMPREENDIMENTO", propertyId };
  } else if (centroCustoTipo === "UNIDADE") {
    const uhId = searchParams.get("unidadeId"); // nome do query param mantido (compat com a UI atual)
    if (!uhId) return NextResponse.json({ error: "unidadeId é obrigatório quando centroCusto=UNIDADE" }, { status: 400 });
    filtroCentroCusto = { tipo: "UNIDADE", uhId };
  } else {
    filtroCentroCusto = { tipo: "GERAL" };
  }

  const dre = await calcularDre(session.tenantId, mes, filtroCentroCusto);

  return NextResponse.json({
    ...dre,
    mesAnterior: mesAdjacente(mes, -1),
    mesSeguinte: mesAdjacente(mes, 1),
  });
}
