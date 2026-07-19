import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";
import { podeGerenciar } from "@/lib/permissions";

// GET /api/secoes — seções + itens (inclui inativos pra tela de config)
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "RESTAURANT"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const secoes = await prisma.menuSection.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { ordem: "asc" },
    include: {
      items: {
        orderBy: { ordem: "asc" },
        include: { stockProduct: { select: { id: true, nome: true, unidade: true, quantidade: true } } },
      },
    },
  });
  return NextResponse.json(secoes);
}

// POST /api/secoes — criar seção
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "RESTAURANT"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  if (!podeGerenciar(session.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { nome, limiteSingle, ordem } = await req.json();
  if (!nome?.trim()) return NextResponse.json({ error: "nome obrigatório" }, { status: 400 });

  const secao = await prisma.menuSection.create({
    data: {
      tenantId: session.tenantId,
      nome: nome.trim(),
      limiteSingle: Math.max(1, Math.floor(Number(limiteSingle)) || 2),
      ordem: Number(ordem) || 0,
    },
  });
  return NextResponse.json(secao, { status: 201 });
}

// PATCH /api/secoes — editar seção
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "RESTAURANT"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  if (!podeGerenciar(session.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id, nome, limiteSingle, ordem, ativo } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const secao = await prisma.menuSection.findUnique({ where: { id } });
  if (!secao || secao.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Seção não encontrada" }, { status: 404 });
  }

  const atualizada = await prisma.menuSection.update({
    where: { id },
    data: {
      ...(nome !== undefined ? { nome: nome.trim() } : {}),
      ...(limiteSingle !== undefined ? { limiteSingle: Math.max(1, Math.floor(Number(limiteSingle)) || 2) } : {}),
      ...(ordem !== undefined ? { ordem: Number(ordem) || 0 } : {}),
      ...(ativo !== undefined ? { ativo: Boolean(ativo) } : {}),
    },
  });
  return NextResponse.json(atualizada);
}
