import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Catálogo de categorias do tenant — alimenta os seletores de categoria em
// Lançamentos, Orçamento e na tela de "pendentes de categorização" da DRE,
// além do CRUD completo usado pela tela de Configurações (pedido do Felipe,
// 05/08/2026: "categorias... devem ser customizáveis — criar, editar,
// mover e apagar").

// GET /api/categorias?todas=1 (opcional: inclui inativas, só usado em Configurações)
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const todas = searchParams.get("todas") === "1";

  const categorias = await prisma.financeCategoria.findMany({
    where: { tenantId: session.tenantId, ...(todas ? {} : { ativo: true }) },
    include: { bloco: { select: { nome: true } } },
    orderBy: [{ bloco: { ordem: "asc" } }, { ordem: "asc" }],
  });

  // Achata bloco.nome -> "bloco" (string), pra manter compatibilidade com
  // as telas que só exibem o nome; blocoId vai junto pra quem precisa
  // agrupar/editar de verdade (Orçamento, Configurações).
  const resposta = categorias.map((c) => ({
    id: c.id,
    nome: c.nome,
    tipo: c.tipo,
    blocoId: c.blocoId,
    bloco: c.bloco.nome,
    ordem: c.ordem,
    ativo: c.ativo,
  }));

  return NextResponse.json(resposta);
}

// POST /api/categorias — cria uma categoria nova (tela de Configurações)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { nome, tipo, blocoId, ordem } = await req.json();
  if (!nome?.trim()) return NextResponse.json({ error: "nome é obrigatório" }, { status: 400 });
  if (tipo !== "RECEITA" && tipo !== "DESPESA") return NextResponse.json({ error: "tipo deve ser RECEITA ou DESPESA" }, { status: 400 });
  if (!blocoId) return NextResponse.json({ error: "blocoId é obrigatório" }, { status: 400 });

  const bloco = await prisma.financeBloco.findUnique({ where: { id: blocoId } });
  if (!bloco || bloco.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Bloco não encontrado" }, { status: 404 });
  }

  try {
    const categoria = await prisma.financeCategoria.create({
      data: { tenantId: session.tenantId, nome: nome.trim(), tipo, blocoId, ordem: ordem ?? 0 },
    });
    return NextResponse.json(categoria, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Já existe uma categoria com esse nome" }, { status: 409 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/categorias — edita nome/tipo/blocoId/ordem/ativo (mover =
// trocar blocoId; reordenar = trocar ordem; desativar = ativo:false)
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { id, nome, tipo, blocoId, ordem, ativo } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const existente = await prisma.financeCategoria.findUnique({ where: { id } });
  if (!existente || existente.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
  }

  if (blocoId !== undefined) {
    const bloco = await prisma.financeBloco.findUnique({ where: { id: blocoId } });
    if (!bloco || bloco.tenantId !== session.tenantId) {
      return NextResponse.json({ error: "Bloco não encontrado" }, { status: 404 });
    }
  }

  try {
    const categoria = await prisma.financeCategoria.update({
      where: { id },
      data: {
        ...(nome !== undefined ? { nome: nome.trim() } : {}),
        ...(tipo !== undefined ? { tipo } : {}),
        ...(blocoId !== undefined ? { blocoId } : {}),
        ...(ordem !== undefined ? { ordem } : {}),
        ...(ativo !== undefined ? { ativo } : {}),
      },
    });
    return NextResponse.json(categoria);
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Já existe uma categoria com esse nome" }, { status: 409 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/categorias?id=xxx — soft delete (ativo:false). Nunca apaga de
// verdade: categorias antigas continuam ligadas ao histórico de
// lançamentos (ver comentário no schema), só somem do seletor de novos
// lançamentos.
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const existente = await prisma.financeCategoria.findUnique({ where: { id } });
  if (!existente || existente.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
  }

  await prisma.financeCategoria.update({ where: { id }, data: { ativo: false } });
  return NextResponse.json({ ok: true });
}
