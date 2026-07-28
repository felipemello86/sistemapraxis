import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@praxis/core";
import { notificarInspecoesEmAtrasoSeHouver } from "@/lib/dailyReport";

export const runtime = "nodejs";

// Cron às 8h (horário de SP) — pedido explícito do Felipe: "às 8am, se
// houver alguma UH com inspeção em atraso, emitir notificação para
// Gerente, Governanta e Master." Mesmo padrão de autenticação e loop
// por-tenant do cron de liberação automática
// (apps/housekeeping/src/app/api/cron/liberacao-automatica/route.ts) — cada
// tenant é verificado independentemente, e uma falha num tenant não impede
// os demais.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenants = await prisma.tenantModule.findMany({
    where: { module: "MAINTENANCE", enabled: true },
    select: { tenantId: true },
  });

  let falhas = 0;
  let tenantsComAtraso = 0;
  for (const { tenantId } of tenants) {
    try {
      const qtd = await notificarInspecoesEmAtrasoSeHouver(tenantId);
      if (qtd > 0) tenantsComAtraso++;
    } catch (e) {
      falhas++;
      console.error(`[cron/inspecoes-atrasadas] falha no tenant ${tenantId}:`, e);
    }
  }

  return NextResponse.json({ ok: true, tenantsVerificados: tenants.length, tenantsComAtraso, falhas });
}
