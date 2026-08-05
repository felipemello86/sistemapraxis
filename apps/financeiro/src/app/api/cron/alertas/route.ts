import { NextRequest, NextResponse } from "next/server";
import { prisma, dataAtualSP, enviarAlertasFinanceiros } from "@praxis/core";

// Chamado pelo Vercel Cron (ver vercel.json — só em dias úteis, requisito 7
// do Felipe: "esse follow-up deve ser de segunda a sexta"). Autenticado via
// CRON_SECRET, mesmo padrão de apps/maintenance/src/app/api/cron/
// resultado-diario/route.ts.
//
// Roda pra todo tenant com o módulo FINANCE habilitado (hoje só bnbflex,
// mas não hardcoded) — cada um recebe alerta só se tiver pendência de
// categorização ou orçamento estourado no mês corrente (ver
// enviarAlertasFinanceiros em @praxis/core, que já filtra isso).
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mes = dataAtualSP().slice(0, 7);

  const tenants = await prisma.tenantModule.findMany({
    where: { module: "FINANCE", enabled: true },
    select: { tenantId: true },
  });

  const resumos = [];
  for (const { tenantId } of tenants) {
    try {
      resumos.push(await enviarAlertasFinanceiros(tenantId, mes));
    } catch (e) {
      console.error(`[cron/alertas] falha no tenant ${tenantId}:`, e);
    }
  }

  return NextResponse.json({ ok: true, mes, tenantsVerificados: tenants.length, resumos });
}
