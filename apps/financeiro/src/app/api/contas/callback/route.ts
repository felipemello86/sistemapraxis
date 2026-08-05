import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma, buscarItem, listarContas } from "@praxis/core";

// Chamado pelo front-end quando o widget Pluggy Connect termina com
// sucesso (evento onSuccess, ver docs.pluggy.ai/docs/connect-widget) — o
// widget devolve um itemId, aqui a gente persiste a conexão
// (FinanceContaConectada) e busca as contas dela (FinanceContaBancaria).
// Idempotente: reconectar o mesmo item (ex.: re-autorização depois de
// LOGIN_ERROR) faz upsert, não duplica.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { itemId } = await req.json();
  if (!itemId) return NextResponse.json({ error: "itemId obrigatório" }, { status: 400 });

  try {
    const item = await buscarItem(itemId);

    const contaConectada = await prisma.financeContaConectada.upsert({
      where: { pluggyItemId: item.id },
      update: { status: item.status, instituicao: item.connector.name },
      create: { tenantId: session.tenantId, pluggyItemId: item.id, instituicao: item.connector.name, status: item.status },
    });

    const contas = await listarContas(item.id);
    for (const c of contas) {
      await prisma.financeContaBancaria.upsert({
        where: { pluggyAccountId: c.id },
        update: { nome: c.name, tipo: c.type, saldoAtual: c.balance, limiteCredito: c.creditData?.creditLimit ?? null },
        create: {
          tenantId: session.tenantId,
          contaConectadaId: contaConectada.id,
          pluggyAccountId: c.id,
          nome: c.name,
          tipo: c.type,
          saldoAtual: c.balance,
          limiteCredito: c.creditData?.creditLimit ?? null,
        },
      });
    }

    return NextResponse.json({ ok: true, contaConectada, totalContas: contas.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
