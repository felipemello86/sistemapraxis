import { NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Agrupa os lançamentos pendentes de categorização (categoriaId=null) por
// fornecedor (ou descrição, quando a Pluggy não manda fornecedor) — pedido
// do Felipe, 05/08/2026, depois da primeira sincronização real ter trazido
// 5194 lançamentos de uma vez (histórico de ~12 meses da Unicred). Agrupar
// reduz isso a um número de grupos muito menor (ex.: "NETFLIX.COM" vira 1
// linha em vez de 23), pra categorizar em lote em vez de um por um.
//
// Chave de agrupamento: fornecedor quando existe (já vem normalizado pela
// Pluggy, mais confiável), senão a descrição bruta. Isso é o mesmo par
// (tipo, chave) que /api/lancamentos/categorizar-lote espera de volta.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const pendentes = await prisma.financeLancamento.findMany({
    where: { tenantId: session.tenantId, categoriaId: null },
    select: { descricao: true, fornecedor: true, valor: true },
  });

  type Grupo = { tipo: "fornecedor" | "descricao"; chave: string; quantidade: number; total: number; exemploDescricao: string };
  const grupos = new Map<string, Grupo>();

  for (const l of pendentes) {
    const tipo: "fornecedor" | "descricao" = l.fornecedor ? "fornecedor" : "descricao";
    const chave = l.fornecedor || l.descricao;
    const id = `${tipo}:${chave}`;
    const existente = grupos.get(id);
    if (existente) {
      existente.quantidade += 1;
      existente.total += Number(l.valor);
    } else {
      grupos.set(id, { tipo, chave, quantidade: 1, total: Number(l.valor), exemploDescricao: l.descricao });
    }
  }

  const lista = Array.from(grupos.values()).sort((a, b) => b.quantidade - a.quantidade);

  return NextResponse.json({ totalPendentes: pendentes.length, grupos: lista });
}
