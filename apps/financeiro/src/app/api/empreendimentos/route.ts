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

// DELETE /api/empreendimentos?id=xxx — EXCLUSÃO DE VERDADE (pedido do
// Felipe, 05/08/2026, 3ª rodada), diferente de "desativar" (PATCH
// ativo:false, que só oculta dos seletores mas preserva histórico).
// Bloqueada enquanto o empreendimento ainda tiver Unidades cadastradas
// (ativas ou não) — exclua/mova as Unidades primeiro (evita apagar um
// prédio inteiro sem querer). Qualquer FinanceLancamento marcado
// diretamente nesse Empreendimento (sem Unidade específica) volta pra
// "Administração" antes de apagar — o dinheiro não desaparece, só passa a
// ser rateado entre todas as Unidades restantes.
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

  const totalUnidades = await prisma.financeUnidade.count({ where: { empreendimentoId: id } });
  if (totalUnidades > 0) {
    return NextResponse.json(
      { error: `Este empreendimento ainda tem ${totalUnidades} unidade(s) cadastrada(s). Exclua (ou mova pra outro empreendimento) as unidades antes de excluir o empreendimento.` },
      { status: 409 }
    );
  }

  const [{ count: lancamentosReatribuidos }] = await prisma.$transaction([
    prisma.financeLancamento.updateMany({
      where: { tenantId: session.tenantId, empreendimentoId: id },
      data: { centroCustoTipo: "ADMINISTRACAO", empreendimentoId: null },
    }),
    prisma.financeEmpreendimento.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true, lancamentosReatribuidos });
}
