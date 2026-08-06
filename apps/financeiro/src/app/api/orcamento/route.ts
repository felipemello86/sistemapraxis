import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma, calcularOrcamento, type FiltroCentroCusto } from "@praxis/core";

// Orçamento — pedido do Felipe, 05 e 06/08/2026: mesma estrutura em árvore
// da DRE (Bloco -> Categoria), com um 3º nível por categoria: os
// lançamentos PREVISTOS daquele mês (recorrentes ou pontuais) e a provisão
// de gastos não definidos (o antigo valor de linha de base por categoria,
// ver POST abaixo — nada mudou nele, só ganhou um novo significado na UI).
// Toda a árvore é calculada em lib/finance/orcamento.ts.

// GET /api/orcamento?mes=YYYY-MM — árvore completa (blocos > categorias >
// previstos + provisão), pronta pra tela desenhar igual à DRE.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const mes = searchParams.get("mes");
  if (!mes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    return NextResponse.json({ error: `Mês inválido: "${mes}" (esperado YYYY-MM)` }, { status: 400 });
  }

  // Geral/Empreendimento/Unidade (pedido do Felipe, 06/08/2026) — mesmo
  // filtro que a DRE já usa, ver lib/finance/centro-de-custo.ts.
  const centroCusto = searchParams.get("centroCusto");
  const empreendimentoId = searchParams.get("empreendimentoId");
  const unidadeId = searchParams.get("unidadeId");
  let filtro: FiltroCentroCusto = { tipo: "GERAL" };
  if (centroCusto === "EMPREENDIMENTO" && empreendimentoId) {
    filtro = { tipo: "EMPREENDIMENTO", empreendimentoId };
  } else if (centroCusto === "UNIDADE" && unidadeId) {
    filtro = { tipo: "UNIDADE", unidadeId };
  }

  const orcamento = await calcularOrcamento(session.tenantId, mes, filtro);
  return NextResponse.json(orcamento);
}

// POST /api/orcamento — cria ou atualiza (upsert) uma linha de orçamento
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { alvoTipo, alvoChave, mes, valor, categoriaId } = await req.json();

  if (alvoTipo !== "CATEGORIA" && alvoTipo !== "BLOCO") {
    return NextResponse.json({ error: "alvoTipo deve ser CATEGORIA ou BLOCO" }, { status: 400 });
  }
  if (!alvoChave) return NextResponse.json({ error: "alvoChave é obrigatória" }, { status: 400 });
  if (!mes || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return NextResponse.json({ error: "mes inválido (esperado YYYY-MM)" }, { status: 400 });
  if (valor == null || valor < 0) return NextResponse.json({ error: "valor deve ser >= 0" }, { status: 400 });

  // alvoChave agora é sempre um id real (categoriaId ou blocoId, desde os
  // blocos configuráveis) — confere que pertence ao tenant antes de gravar.
  if (alvoTipo === "BLOCO") {
    const bloco = await prisma.financeBloco.findUnique({ where: { id: alvoChave } });
    if (!bloco || bloco.tenantId !== session.tenantId) {
      return NextResponse.json({ error: "Bloco não encontrado" }, { status: 404 });
    }
  } else {
    const categoria = await prisma.financeCategoria.findUnique({ where: { id: alvoChave } });
    if (!categoria || categoria.tenantId !== session.tenantId) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    }
  }

  try {
    const orcamento = await prisma.financeOrcamento.upsert({
      where: { tenantId_alvoTipo_alvoChave_mes: { tenantId: session.tenantId, alvoTipo, alvoChave, mes } },
      update: { valor },
      create: {
        tenantId: session.tenantId,
        alvoTipo,
        alvoChave,
        categoriaId: alvoTipo === "CATEGORIA" ? categoriaId ?? alvoChave : null,
        mes,
        valor,
      },
    });
    return NextResponse.json(orcamento, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/orcamento?id=xxx
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const existente = await prisma.financeOrcamento.findUnique({ where: { id } });
  if (!existente || existente.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Orçamento não encontrado" }, { status: 404 });
  }

  await prisma.financeOrcamento.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
