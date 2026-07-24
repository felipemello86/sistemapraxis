import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@praxis/core";
import { runDetectorsForTenant } from "@praxis/ai-engine";

// Cron do AI Engine — mesmo padrão de autenticação dos outros crons da suíte
// (CRON_SECRET, ver apps/maintenance/src/app/api/cron/resultado-diario e
// apps/housekeeping/src/app/api/cron/late-checkout). "Contínuo" na prática
// quer dizer "roda a cada poucos minutos" (ver vercel.json) — a hospedagem é
// 100% serverless, não existe processo long-running pra um stream de
// verdade. Um tenant por vez, detectores isolados entre si dentro de
// runDetectorsForTenant (erro num detector não derruba os outros nem os
// outros tenants).
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantsHabilitados = await prisma.tenantModule.findMany({
    where: { module: "INTELLIGENCE", enabled: true },
    select: { tenantId: true },
  });

  const resultado: Record<string, unknown> = {};
  for (const { tenantId } of tenantsHabilitados) {
    try {
      resultado[tenantId] = await runDetectorsForTenant(tenantId);
    } catch (e) {
      console.error(`[cron/ai-engine] falha no tenant ${tenantId}:`, e);
      resultado[tenantId] = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  return NextResponse.json({ ok: true, tenantsProcessados: tenantsHabilitados.length, resultado });
}
