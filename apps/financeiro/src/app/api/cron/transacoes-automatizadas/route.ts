import { NextRequest, NextResponse } from "next/server";
import { prisma, dataAtualSP, gerarExecucoesDoDia, detectarExecucoesConfirmadas } from "@praxis/core";

// Varredura diária das regras de Transações Automatizadas (pedido do
// Felipe, 07/08/2026) — "dia 1º o sistema dá início por conta própria ao
// processo de pagamento". Mesmo padrão de autenticação/estrutura dos
// demais crons (ver cron/sync-pluggy e cron/alertas): CRON_SECRET, roda
// pra todo tenant com módulo FINANCE habilitado, idempotente (ver
// gerarExecucoesDoDia — unique [transacaoAutomatizadaId, mesReferencia]).
//
// Também roda detectarExecucoesConfirmadas em toda passada (segunda
// cobertura além da chamada em cron/sync-pluggy) — cobre o caso de uma
// transação real já ter chegado da Pluggy ANTES de existir uma execução
// AGUARDANDO_MASTER pra casar com ela (idempotente, sem custo real rodar
// de novo quando não há nada pendente).
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hoje = dataAtualSP();

  const tenants = await prisma.tenantModule.findMany({
    where: { module: "FINANCE", enabled: true },
    select: { tenantId: true },
  });

  const resultados = [];
  for (const { tenantId } of tenants) {
    try {
      const r = await gerarExecucoesDoDia(tenantId, hoje);
      const detectadas = await detectarExecucoesConfirmadas(tenantId);
      resultados.push({ tenantId, ...r, ...detectadas });
    } catch (e: any) {
      console.error(`[cron/transacoes-automatizadas] falha no tenant ${tenantId}:`, e.message);
      resultados.push({ tenantId, erro: e.message });
    }
  }

  return NextResponse.json({ ok: true, hoje, resultados });
}
