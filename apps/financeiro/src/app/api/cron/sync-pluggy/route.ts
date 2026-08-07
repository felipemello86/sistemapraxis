import { NextRequest, NextResponse } from "next/server";
import { prisma, sincronizarContasDoTenant, detectarExecucoesConfirmadas } from "@praxis/core";

// Varredura diária das contas conectadas via Pluggy (requisito 6). Mesmo
// padrão de autenticação dos demais crons (CRON_SECRET). Roda pra todo
// tenant com módulo FINANCE habilitado; se a Pluggy ainda não estiver
// configurada (PLUGGY_CLIENT_ID/SECRET ausentes — caso atual, ver
// pluggy.ts), cada chamada falha rápido e o cron só loga, sem quebrar.
//
// Depois de cada sincronização, roda também detectarExecucoesConfirmadas
// (pedido do Felipe, 07/08/2026: "o movimento da coluna Aprovação Master
// para Executadas sempre deve ser automatizado, e nunca manual") — casa as
// transações REAIS recém-importadas com as Transações Automatizadas
// aguardando o Master pagar, sem esperar o cron separado de
// transacoes-automatizadas (que também chama a mesma função, como
// segunda passada de cobertura).
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenants = await prisma.tenantModule.findMany({
    where: { module: "FINANCE", enabled: true },
    select: { tenantId: true },
  });

  const resultados = [];
  for (const { tenantId } of tenants) {
    try {
      const r = await sincronizarContasDoTenant(tenantId);
      const detectadas = await detectarExecucoesConfirmadas(tenantId);
      resultados.push({ tenantId, ...r, ...detectadas });
    } catch (e: any) {
      console.error(`[cron/sync-pluggy] falha no tenant ${tenantId}:`, e.message);
      resultados.push({ tenantId, erro: e.message });
    }
  }

  return NextResponse.json({ ok: true, resultados });
}
