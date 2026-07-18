import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Decisão explícita do Felipe: só Master, Gerente e Governanta podem
// gerenciar estoque (cadastrar/editar produto, registrar movimentação) —
// diferente de Governança, onde Atendimento também tem acesso de gestão.
// Aqui Atendimento não entra de jeito nenhum (nem leitura, já que
// UserModuleAccess do módulo STOCK só é concedido a essas 3 roles).
function podeGerenciar(role: string) {
  return ["MASTER", "GERENTE", "GOVERNANTA"].includes(role);
}

// GET /api/produtos?incluirInativos=1
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "STOCK"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const incluirInativos = req.nextUrl.searchParams.get("incluirInativos") === "1";

  const produtos = await prisma.stockProduct.findMany({
    where: { tenantId: session.tenantId, ...(incluirInativos ? {} : { ativo: true }) },
    orderBy: { nome: "asc" },
  });

  return NextResponse.json(produtos);
}

// POST /api/produtos - cadastrar produto
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "STOCK"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  if (!podeGerenciar(session.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { nome, categoria, unidade, quantidade, estoqueMinimo, custo, fornecedor } = await req.json();
  if (!nome?.trim() || !categoria?.trim()) {
    return NextResponse.json({ error: "nome e categoria são obrigatórios" }, { status: 400 });
  }

  try {
    const produto = await prisma.stockProduct.create({
      data: {
        tenantId: session.tenantId,
        nome: nome.trim(),
        categoria: categoria.trim(),
        unidade: unidade?.trim() || "un",
        quantidade: Number(quantidade) || 0,
        estoqueMinimo: Number(estoqueMinimo) || 0,
        custo: custo != null && custo !== "" ? Number(custo) : null,
        fornecedor: fornecedor?.trim() || null,
      },
    });
    return NextResponse.json(produto, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/produtos - editar produto (id + campos) ou alternar ativo
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "STOCK"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  if (!podeGerenciar(session.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id, nome, categoria, unidade, estoqueMinimo, custo, fornecedor, ativo } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const produto = await prisma.stockProduct.findUnique({ where: { id } });
  if (!produto || produto.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  }

  try {
    const atualizado = await prisma.stockProduct.update({
      where: { id },
      data: {
        ...(nome !== undefined ? { nome: nome.trim() } : {}),
        ...(categoria !== undefined ? { categoria: categoria.trim() } : {}),
        ...(unidade !== undefined ? { unidade: unidade.trim() || "un" } : {}),
        ...(estoqueMinimo !== undefined ? { estoqueMinimo: Number(estoqueMinimo) || 0 } : {}),
        ...(custo !== undefined ? { custo: custo != null && custo !== "" ? Number(custo) : null } : {}),
        ...(fornecedor !== undefined ? { fornecedor: fornecedor?.trim() || null } : {}),
        ...(ativo !== undefined ? { ativo: Boolean(ativo) } : {}),
      },
    });
    return NextResponse.json(atualizado);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
