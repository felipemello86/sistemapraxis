import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Lista as contas já conectadas via Pluggy (requisito 6/10 — bloqueado até
// o Felipe gerar credenciais em dashboard.pluggy.ai). Enquanto não há
// nenhuma FinanceContaConectada, a tela mostra o estado "nada conectado
// ainda" — não é erro, é o estado inicial esperado do módulo.
//
// Resposta traz `nome` (original, vindo da Pluggy) E `apelido` (editável,
// pode ser null) de cada conta SEPARADOS de propósito — esta é a única
// tela (Contas conectadas) que precisa dos dois ao mesmo tempo, pra editar
// o apelido mostrando qual é a conta real por trás. As demais telas do
// sistema (Lançamentos, Conciliações, Cartões de Crédito) preferem
// `apelido ?? nome` como nome de exibição — ver PATCH abaixo pra edição.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const contasConectadas = await prisma.financeContaConectada.findMany({
    where: { tenantId: session.tenantId },
    include: { contas: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    pluggyConfigurado: Boolean(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET),
    contasConectadas,
  });
}

// PATCH /api/contas — { contaBancariaId, apelido } — edita o apelido de uma
// conta/cartão (pedido do Felipe, 07/08/2026). apelido "" ou null limpa o
// apelido (volta a exibir o nome original da Pluggy em todo o sistema).
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { contaBancariaId, apelido } = await req.json();
  if (!contaBancariaId) return NextResponse.json({ error: "contaBancariaId obrigatório" }, { status: 400 });

  const existente = await prisma.financeContaBancaria.findUnique({ where: { id: contaBancariaId } });
  if (!existente || existente.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  }

  const atualizada = await prisma.financeContaBancaria.update({
    where: { id: contaBancariaId },
    data: { apelido: apelido?.trim() || null },
  });
  return NextResponse.json(atualizada);
}
