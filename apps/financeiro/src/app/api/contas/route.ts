import { NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Lista as contas já conectadas via Pluggy (requisito 6/10 — bloqueado até
// o Felipe gerar credenciais em dashboard.pluggy.ai). Enquanto não há
// nenhuma FinanceContaConectada, a tela mostra o estado "nada conectado
// ainda" — não é erro, é o estado inicial esperado do módulo.
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
