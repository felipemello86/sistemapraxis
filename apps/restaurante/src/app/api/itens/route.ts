import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";
import { podeGerenciar } from "@/lib/permissions";

// POST /api/itens — criar item do cardápio.
// Regra central da integração: NÃO existe item de cardápio sem produto de
// estoque. Ou o chamador manda `stockProductId` (produto já cadastrado no
// Estoque), ou manda `novoProduto` — e aí o produto é criado AQUI, já
// repercutindo no módulo Estoque (mesma tabela StockProduct).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "RESTAURANT"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  if (!podeGerenciar(session.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { sectionId, nome, descricao, quantidadePorPorcao, stockProductId, novoProduto, ordem } = await req.json();
  if (!sectionId || !nome?.trim()) {
    return NextResponse.json({ error: "sectionId e nome são obrigatórios" }, { status: 400 });
  }

  const secao = await prisma.menuSection.findUnique({ where: { id: sectionId } });
  if (!secao || secao.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Seção não encontrada" }, { status: 404 });
  }

  let productId: string;
  if (stockProductId) {
    const produto = await prisma.stockProduct.findUnique({ where: { id: stockProductId } });
    if (!produto || produto.tenantId !== session.tenantId) {
      return NextResponse.json({ error: "Produto de estoque não encontrado" }, { status: 404 });
    }
    productId = produto.id;
  } else if (novoProduto?.nome?.trim()) {
    const criado = await prisma.stockProduct.create({
      data: {
        tenantId: session.tenantId,
        nome: novoProduto.nome.trim(),
        categoria: novoProduto.categoria?.trim() || "RESTAURANTE",
        unidade: novoProduto.unidade?.trim() || "un",
        quantidade: Number(novoProduto.quantidade) || 0,
        estoqueMinimo: Number(novoProduto.estoqueMinimo) || 0,
      },
    });
    productId = criado.id;
  } else {
    return NextResponse.json(
      { error: "Informe stockProductId (produto existente) ou novoProduto (cadastra no Estoque junto)" },
      { status: 400 },
    );
  }

  const item = await prisma.menuItem.create({
    data: {
      tenantId: session.tenantId,
      sectionId,
      nome: nome.trim(),
      descricao: descricao?.trim() || null,
      quantidadePorPorcao: Math.max(0.01, Number(quantidadePorPorcao) || 1),
      stockProductId: productId,
      ordem: Number(ordem) || 0,
    },
    include: { stockProduct: { select: { id: true, nome: true, unidade: true, quantidade: true } } },
  });
  return NextResponse.json(item, { status: 201 });
}

// PATCH /api/itens — editar item
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "RESTAURANT"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  if (!podeGerenciar(session.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id, nome, descricao, quantidadePorPorcao, stockProductId, ordem, ativo } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const item = await prisma.menuItem.findUnique({ where: { id } });
  if (!item || item.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
  }

  if (stockProductId) {
    const produto = await prisma.stockProduct.findUnique({ where: { id: stockProductId } });
    if (!produto || produto.tenantId !== session.tenantId) {
      return NextResponse.json({ error: "Produto de estoque não encontrado" }, { status: 404 });
    }
  }

  const atualizado = await prisma.menuItem.update({
    where: { id },
    data: {
      ...(nome !== undefined ? { nome: nome.trim() } : {}),
      ...(descricao !== undefined ? { descricao: descricao?.trim() || null } : {}),
      ...(quantidadePorPorcao !== undefined ? { quantidadePorPorcao: Math.max(0.01, Number(quantidadePorPorcao) || 1) } : {}),
      ...(stockProductId ? { stockProductId } : {}),
      ...(ordem !== undefined ? { ordem: Number(ordem) || 0 } : {}),
      ...(ativo !== undefined ? { ativo: Boolean(ativo) } : {}),
    },
    include: { stockProduct: { select: { id: true, nome: true, unidade: true, quantidade: true } } },
  });
  return NextResponse.json(atualizado);
}
