import { NextResponse } from "next/server";
import { getSession, hasModuleAccess, calcularDre, dataAtualSP, mesAdjacente } from "@praxis/core";

// Calcula a DRE de um mês (?mes=YYYY-MM, default: mês atual) — passado,
// atual ou futuro, mesma função pras três situações (requisito 2 do
// Felipe). Ver lib/finance/dre.ts em @praxis/core pra fórmula e regras de
// projeção de recorrência.
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

  const dre = await calcularDre(session.tenantId, mes);

  return NextResponse.json({
    ...dre,
    mesAnterior: mesAdjacente(mes, -1),
    mesSeguinte: mesAdjacente(mes, 1),
  });
}
