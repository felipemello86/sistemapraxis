import { NextRequest, NextResponse } from "next/server";
import { prisma, sincronizarContasDoTenant } from "@praxis/core";

// Varredura diária das contas conectadas via Pluggy (requisito 6). Mesmo
// padrão de autenticação dos demais crons (CRON_SECRET). Roda pra todo
// tenant com módulo FINANCE habilitado; se a Pluggy ainda não estiver
// configurada (PLUGGY_CLIENT_ID/SECRET ausentes — caso atual, ver
// pluggy.ts), cada chamada falha rápido e o cron só loga, sem quebrar.
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
      resultados.push({ tenantId, ...r });
    } catch (e: any) {
      console.error(`[cron/sync-pluggy] falha no tenant ${tenantId}:`, e.message);
      resultados.push({ tenantId, erro: e.message });
    }
  }

  return NextResponse.json({ ok: true, resultados });
}
