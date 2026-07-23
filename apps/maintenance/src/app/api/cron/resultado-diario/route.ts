import { NextRequest, NextResponse } from "next/server";
import { prisma, dataAtualSP } from "@praxis/core";
import { enviarResultadoDiarioSeNecessario } from "@/lib/dailyReport";

// Chamado pelo Vercel Cron (ver vercel.json) — não tem sessão de usuário,
// autenticado via CRON_SECRET (mesmo padrão de
// apps/housekeeping/src/app/api/cron/late-checkout/route.ts).
//
// Cobre o gatilho "às 19h" do Resultado Diário da Manutenção — pra quando
// sobra card não executado até lá (o gatilho "ao executar o último card" já
// dispara na hora, direto na Server Action, ver executarCardExecucaoAction
// em app/actions/correcao.ts). Idempotente via reportSentAt: se o outro
// gatilho já mandou, este vira no-op pro mesmo compromisso.
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hoje = dataAtualSP();

  const commitments = await prisma.maintenanceDailyCommitment.findMany({
    where: { data: hoje, reportSentAt: null },
    select: { id: true },
  });

  let falhas = 0;
  for (const { id } of commitments) {
    try {
      await enviarResultadoDiarioSeNecessario(id);
    } catch (e) {
      falhas++;
      console.error(`[cron/resultado-diario] falha no compromisso ${id}:`, e);
    }
  }

  return NextResponse.json({ ok: true, compromissosVerificados: commitments.length, falhas });
}
