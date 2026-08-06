import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Catálogo de Unidades (ex.: "101", "203" dentro do empreendimento
// "Vicentina") — nível mais baixo da hierarquia de Centro de Custo
// (Administração -> Empreendimento -> Unidade), pedido do Felipe,
// 05/08/2026. Toda Unidade pertence a exatamente um Empreendimento. O
// número de Unidades ATIVAS é o denominador do rateio de custos de
// Administração/Empreendimento na DRE (ver lib/finance/centro-de-custo.ts)
// — por isso desativar/reativar uma Unidade aqui muda o rateio de TODOS os
// meses na próxima consulta.

// GET /api/unidades?empreendimentoId=xxx&todas=1
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const todas = searchParams.get("todas") === "1";
  const empreendimentoId = searchParams.get("empreendimentoId");

  const unidades = await prisma.financeUnidade.findMany({
    where: {
      tenantId: session.tenantId,
      ...(todas ? {} : { ativo: true }),
      ...(empreendimentoId ? { empreendimentoId } : {}),
    },
    include: { empreendimento: { select: { nome: true } } },
    orderBy: [{ empreendimento: { nome: "asc" } }, { nome: "asc" }],
  });

  return NextResponse.json(
    unidades.map((u) => ({
      id: u.id,
      nome: u.nome,
      ativo: u.ativo,
      desativadaEm: u.desativadaEm,
      empreendimentoId: u.empreendimentoId,
      empreendimento: u.empreendimento.nome,
    }))
  );
}

// POST /api/unidades — cria uma unidade nova dentro de um empreendimento
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { nome, empreendimentoId } = await req.json();
  if (!nome?.trim()) return NextResponse.json({ error: "nome é obrigatório" }, { status: 400 });
  if (!empreendimentoId) return NextResponse.json({ error: "empreendimentoId é obrigatório" }, { status: 400 });

  const empreendimento = await prisma.financeEmpreendimento.findUnique({ where: { id: empreendimentoId } });
  if (!empreendimento || empreendimento.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Empreendimento não encontrado" }, { status: 404 });
  }

  try {
    const unidade = await prisma.financeUnidade.create({
      data: { tenantId: session.tenantId, nome: nome.trim(), empreendimentoId },
    });
    return NextResponse.json(unidade, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Já existe uma unidade com esse nome nesse empreendimento" }, { status: 409 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/unidades — edita nome/empreendimentoId (mover de prédio)/ativo
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { id, nome, empreendimentoId, ativo, desativadaEm } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const existente = await prisma.financeUnidade.findUnique({ where: { id } });
  if (!existente || existente.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Unidade não encontrada" }, { status: 404 });
  }

  if (empreendimentoId !== undefined) {
    const empreendimento = await prisma.financeEmpreendimento.findUnique({ where: { id: empreendimentoId } });
    if (!empreendimento || empreendimento.tenantId !== session.tenantId) {
      return NextResponse.json({ error: "Empreendimento não encontrado" }, { status: 404 });
    }
  }

  // Desativar exige mês/ano (pedido do Felipe, 05/08/2026, 2ª rodada): o
  // rateio continua contando a Unidade até esse mês (inclusive), só some do
  // denominador a partir do mês seguinte — ver lib/finance/centro-de-custo.ts.
  // Reativar sempre limpa desativadaEm (volta a contar em todo mês, sem
  // buraco — não suportamos múltiplos períodos de ativação/desativação).
  let desativadaEmData: { desativadaEm: string | null } | undefined;
  if (ativo === false) {
    if (!desativadaEm || !/^\d{4}-(0[1-9]|1[0-2])$/.test(desativadaEm)) {
      return NextResponse.json({ error: "desativadaEm é obrigatório e deve ser YYYY-MM ao desativar uma unidade" }, { status: 400 });
    }
    desativadaEmData = { desativadaEm };
  } else if (ativo === true) {
    desativadaEmData = { desativadaEm: null };
  }

  try {
    const unidade = await prisma.financeUnidade.update({
      where: { id },
      data: {
        ...(nome !== undefined ? { nome: nome.trim() } : {}),
        ...(empreendimentoId !== undefined ? { empreendimentoId } : {}),
        ...(ativo !== undefined ? { ativo: Boolean(ativo) } : {}),
        ...(desativadaEmData ?? {}),
      },
    });
    return NextResponse.json(unidade);
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Já existe uma unidade com esse nome nesse empreendimento" }, { status: 409 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/unidades?id=xxx — soft delete (ativo:false). Sai dos
// seletores de novo lançamento E do denominador do rateio, mas mantém o
// histórico de lançamentos já ligados a ela.
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const existente = await prisma.financeUnidade.findUnique({ where: { id } });
  if (!existente || existente.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Unidade não encontrada" }, { status: 404 });
  }

  await prisma.financeUnidade.update({ where: { id }, data: { ativo: false } });
  return NextResponse.json({ ok: true });
}
