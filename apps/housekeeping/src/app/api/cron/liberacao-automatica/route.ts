import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@praxis/core";
import { liberarSelecionadasAoMeioDia } from "@/lib/liberacao-automatica";

export const runtime = "nodejs";

// Cron ao meio-dia (horário de SP) — ver comentário em
// lib/liberacao-automatica.ts. Mesmo padrão de autenticação e loop
// por-tenant do cron de late-checkout (api/cron/late-checkout/route.ts).
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenants = await prisma.tenantModule.findMany({
    where: { module: "HOUSEKEEPING", enabled: true },
    select: { tenantId: true },
  });

  let falhas = 0;
  for (const { tenantId } of tenants) {
    try {
      await liberarSelecionadasAoMeioDia(tenantId);
    } catch (e) {
      falhas++;
      console.error(`[cron/liberacao-automatica] falha no tenant ${tenantId}:`, e);
    }
  }

  return NextResponse.json({ ok: true, tenantsVerificados: tenants.length, falhas });
}
