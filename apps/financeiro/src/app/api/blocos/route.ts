import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Blocos (super-categorias) configuráveis — pedido do Felipe, 05/08/2026:
// "super-categorias e relações de soma e subtração devem ser
// customizáveis... criar, editar, mover e subtrair todos os campos". Cada
// bloco decide, via `totalizador`, em qual dos 4 totais fixos da DRE entra
// (MARGEM_BRUTA | DESPESAS | LUCRO_PREJUIZO_EXTRA — ver lib/finance/dre.ts
// pra fórmula completa) e via `sinal` (1|-1) se soma ou subtrai dali.
// Consumido pela tela de Configurações e por Orçamento (que precisa da
// lista de blocos pra agrupar categorias).

const TOTALIZADORES = ["MARGEM_BRUTA", "DESPESAS", "LUCRO_PREJUIZO_EXTRA"] as const;

// GET /api/blocos
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const blocos = await prisma.financeBloco.findMany({
    where: { tenantId: session.tenantId },
    orderBy: [{ totalizador: "asc" }, { ordem: "asc" }],
    include: { _count: { select: { categorias: true } } },
  });

  return NextResponse.json(
    blocos.map((b) => ({
      id: b.id,
      nome: b.nome,
      ordem: b.ordem,
      totalizador: b.totalizador,
      sinal: b.sinal,
      totalCategorias: b._count.categorias,
    }))
  );
}

// POST /api/blocos — cria um bloco novo
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { nome, totalizador, sinal, ordem } = await req.json();
  if (!nome?.trim()) return NextResponse.json({ error: "nome é obrigatório" }, { status: 400 });
  if (!TOTALIZADORES.includes(totalizador)) {
    return NextResponse.json({ error: `totalizador deve ser um de: ${TOTALIZADORES.join(", ")}` }, { status: 400 });
  }
  const sinalNum = sinal === -1 ? -1 : 1;

  try {
    const bloco = await prisma.financeBloco.create({
      data: { tenantId: session.tenantId, nome: nome.trim(), totalizador, sinal: sinalNum, ordem: ordem ?? 0 },
    });
    return NextResponse.json(bloco, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Já existe um bloco com esse nome" }, { status: 409 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/blocos — edita nome/totalizador/sinal/ordem ("mover" = trocar
// totalizador ou ordem; "subtrair" = sinal -1)
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { id, nome, totalizador, sinal, ordem } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  if (totalizador !== undefined && !TOTALIZADORES.includes(totalizador)) {
    return NextResponse.json({ error: `totalizador deve ser um de: ${TOTALIZADORES.join(", ")}` }, { status: 400 });
  }

  const existente = await prisma.financeBloco.findUnique({ where: { id } });
  if (!existente || existente.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Bloco não encontrado" }, { status: 404 });
  }

  try {
    const bloco = await prisma.financeBloco.update({
      where: { id },
      data: {
        ...(nome !== undefined ? { nome: nome.trim() } : {}),
        ...(totalizador !== undefined ? { totalizador } : {}),
        ...(sinal !== undefined ? { sinal: sinal === -1 ? -1 : 1 } : {}),
        ...(ordem !== undefined ? { ordem } : {}),
      },
    });
    return NextResponse.json(bloco);
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Já existe um bloco com esse nome" }, { status: 409 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/blocos?id=xxx — só apaga bloco vazio (sem categoria
// nenhuma apontando pra ele — o FK é Restrict de propósito, isto aqui só
// dá uma mensagem amigável ANTES de bater no erro de banco).
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const existente = await prisma.financeBloco.findUnique({ where: { id }, include: { _count: { select: { categorias: true } } } });
  if (!existente || existente.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Bloco não encontrado" }, { status: 404 });
  }
  if (existente._count.categorias > 0) {
    return NextResponse.json(
      { error: `Este bloco tem ${existente._count.categorias} categoria(s) — mova ou apague as categorias antes de apagar o bloco.` },
      { status: 409 }
    );
  }

  await prisma.financeBloco.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
