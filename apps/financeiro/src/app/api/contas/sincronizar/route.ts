import { NextResponse } from "next/server";
import { getSession, hasModuleAccess, sincronizarContasDoTenant } from "@praxis/core";

// POST /api/contas/sincronizar — força uma sincronização imediata das
// contas conectadas do tenant (pedido do Felipe, 06/08/2026: "como faço
// pra forçar uma nova coleta de dados?" — antes disso, sync só rodava pelo
// cron diário de 11h UTC ou pelo webhook da Pluggy quando ELA detectava
// transação nova, sem nenhum jeito do usuário disparar na hora). Chama a
// mesma função usada pelo cron/webhook — já é idempotente (dedup por
// pluggyTransactionId), então clicar várias vezes seguidas é seguro, só
// não traz nada de novo se não houver nada de novo na Pluggy ainda.
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "FINANCE"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  try {
    const resultado = await sincronizarContasDoTenant(session.tenantId);
    return NextResponse.json(resultado);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Erro ao sincronizar." }, { status: 500 });
  }
}
