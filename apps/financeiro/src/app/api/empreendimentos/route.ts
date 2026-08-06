import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Catálogo de Empreendimentos ("Administração Local" — ex.: prédio
// "Vicentina") — nível intermediário da hierarquia de Centro de Custo
// (Administração -> Empreendimento -> Unidade), pedido do Felipe,
// 05/08/2026. Alimenta o seletor de centro de custo em Lançamentos, o
// seletor "Empreendimento" na DRE, e é gerenciado na tela de Configurações.

// GET /api/empreendimentos?todas=1 (opcional: inclui inativos, só usado em Configurações)
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const todas = searchParams.get("todas") === "1";

  const empreendimentos = await prisma.financeEmpreendimento.findMany({
    where: { tenantId: session.tenantId, ...(todas ? {} : { ativo: true }) },
    include: { unidades: { select: { id: true, ativo: true } } },
    orderBy: { nome: "asc" },
  });

  return NextResponse.json(
    empreendimentos.map((e) => ({
      id: e.id,
      nome: e.nome,
      ativo: e.ativo,
      totalUnidades: e.unidades.length,
      totalUnidadesAtivas: e.unidades.filter((u) => u.ativo).length,
    }))
  );
}

// POST /api/empreendimentos — cria um empreendimento novo
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { nome } = await req.json();
  if (!nome?.trim()) return NextResponse.json({ error: "nome é obrigatório" }, { status: 400 });

  try {
    const empreendimento = await prisma.financeEmpreendimento.create({
      data: { tenantId: session.tenantId, nome: nome.trim() },
    });
    return NextResponse.json(empreendimento, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Já existe um empreendimento com esse nome" }, { status: 409 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/empreendimentos — edita nome/ativo
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { id, nome, ativo } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const existente = await prisma.financeEmpreendimento.findUnique({ where: { id } });
  if (!existente || existente.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Empreendimento não encontrado" }, { status: 404 });
  }

  try {
    const empreendimento = await prisma.financeEmpreendimento.update({
      where: { id },
      data: {
        ...(nome !== undefined ? { nome: nome.trim() } : {}),
        ...(ativo !== undefined ? { ativo: Boolean(ativo) } : {}),
      },
    });
    return NextResponse.json(empreendimento);
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Já existe um empreendimento com esse nome" }, { status: 409 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/empreendimentos?id=xxx — soft delete (ativo:false). Nunca
// apaga de verdade: empreendimentos antigos continuam ligados ao histórico
// de lançamentos e às Unidades já cadastradas (ver onDelete: Restrict no
// schema pra apagar de verdade), só somem dos seletores de novo lançamento.
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const existente = await prisma.financeEmpreendimento.findUnique({ where: { id } });
  if (!existente || existente.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Empreendimento não encontrado" }, { status: 404 });
  }

  await prisma.financeEmpreendimento.update({ where: { id }, data: { ativo: false } });
  return NextResponse.json({ ok: true });
}
