import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Configuração dos cartões de crédito conectados (requisito do Felipe,
// 05/08/2026): dia de vencimento da fatura, usado por
// lib/finance/pluggy.ts pra calcular a Data de Vencimento de cada compra
// como "a fatura em que ela cai", em vez da data da compra em si.

// GET /api/contas/cartoes — lista só as FinanceContaBancaria tipo=CREDIT
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const cartoes = await prisma.financeContaBancaria.findMany({
    where: { tenantId: session.tenantId, tipo: "CREDIT" },
    include: { contaConectada: { select: { instituicao: true } } },
    orderBy: { nome: "asc" },
  });

  return NextResponse.json(
    cartoes.map((c) => ({
      id: c.id,
      nome: c.nome,
      instituicao: c.contaConectada.instituicao,
      diaVencimentoFatura: c.diaVencimentoFatura,
    }))
  );
}

// PATCH /api/contas/cartoes — { id, diaVencimentoFatura: 1-31 }
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { id, diaVencimentoFatura } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  const dia = Number(diaVencimentoFatura);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
    return NextResponse.json({ error: "diaVencimentoFatura deve ser um inteiro entre 1 e 31" }, { status: 400 });
  }

  const existente = await prisma.financeContaBancaria.findUnique({ where: { id } });
  if (!existente || existente.tenantId !== session.tenantId || existente.tipo !== "CREDIT") {
    return NextResponse.json({ error: "Cartão não encontrado" }, { status: 404 });
  }

  const atualizado = await prisma.financeContaBancaria.update({ where: { id }, data: { diaVencimentoFatura: dia } });
  return NextResponse.json(atualizado);
}
