import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@praxis/core";
import { liberarLateCheckoutsVencidos } from "@/lib/late-checkout";

// Chamado pelo Vercel Cron (ver vercel.json) — não tem sessão de usuário,
// então a autenticação é via CRON_SECRET (padrão recomendado pela Vercel:
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
//
// Existe pra garantir que UHs em Late Check-out sejam liberadas mesmo se
// ninguém estiver com Seleção e Liberação ou Tempo Real abertos — essas duas
// telas já fazem a mesma checagem como efeito colateral (ver
// lib/late-checkout.ts), mas dependem de alguém estar de fato usando o app
// no momento em que a hora de saída chega.
export const runtime = "nodejs";

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
      await liberarLateCheckoutsVencidos(tenantId);
    } catch (e) {
      falhas++;
      console.error(`[cron/late-checkout] falha no tenant ${tenantId}:`, e);
    }
  }

  return NextResponse.json({ ok: true, tenantsVerificados: tenants.length, falhas });
}
