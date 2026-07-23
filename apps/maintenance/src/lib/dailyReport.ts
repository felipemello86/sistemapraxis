import { prisma, sendPushToUser } from "@praxis/core";

// Lógica compartilhada entre a Server Action que executa o último card do
// dia (apps/maintenance/src/app/actions/correcao.ts) e o cron de 19h
// (apps/maintenance/src/app/api/cron/resultado-diario/route.ts) — os dois
// gatilhos descritos pelo Felipe pro "Resultado Diário da Manutenção" ("ao
// executar o último card do dia OU às 19h, o que vier primeiro"). Fica num
// módulo comum (em vez de só na Server Action) porque uma rota de API não
// pode importar uma função de um arquivo "use server" que não seja ela
// mesma uma Server Action.

/**
 * Conformidade ATUAL do tenant — mesmo critério do card "Conformidade
 * geral" da tela Evolução (última inspeção de cada UH, não a mistura de
 * todas as inspeções já feitas). Reimplementado aqui direto sobre Prisma
 * (em vez de reusar lib/domain.ts, que espera o "view model" já moldado
 * pra client) porque roda em contexto de servidor/cron.
 */
export async function calcularConformidadeAtual(tenantId: string): Promise<number> {
  const inspections = await prisma.maintenanceInspection.findMany({
    where: { tenantId },
    select: { uhId: true, date: true, items: { select: { status: true } } },
  });

  const porUnidade = new Map<string, { date: Date; items: { status: string }[] }>();
  for (const insp of inspections) {
    const atual = porUnidade.get(insp.uhId);
    if (!atual || insp.date > atual.date) {
      porUnidade.set(insp.uhId, { date: insp.date, items: insp.items });
    }
  }

  let ok = 0;
  let total = 0;
  for (const { items } of porUnidade.values()) {
    total += items.length;
    ok += items.filter((i) => i.status === "CONFORME").length;
  }
  return total > 0 ? Math.round((ok / total) * 100) : 0;
}

export async function notificarTodosDoTenant(
  tenantId: string,
  payload: { title: string; body: string; data?: Record<string, string> },
) {
  const usuarios = await prisma.user.findMany({
    where: { tenantId, ativo: true },
    select: { id: true },
  });
  for (const u of usuarios) {
    await sendPushToUser(u.id, payload);
  }
}

export async function notificarPorRoles(
  tenantId: string,
  roles: string[],
  payload: { title: string; body: string; data?: Record<string, string> },
) {
  const usuarios = await prisma.user.findMany({
    where: { tenantId, ativo: true, role: { in: roles } },
    select: { id: true },
  });
  for (const u of usuarios) {
    await sendPushToUser(u.id, payload);
  }
}

/**
 * Envia o "Resultado Diário da Manutenção" pra um compromisso do dia — SÓ SE
 * ainda não foi enviado (reportSentAt null). Chamado tanto ao executar o
 * último card pendente do dia quanto pelo cron de 19h — o primeiro que
 * chegar aqui com o compromisso ainda não fechado "vence"; o outro vira
 * no-op (idempotência via reportSentAt).
 */
export async function enviarResultadoDiarioSeNecessario(commitmentId: string) {
  const commitment = await prisma.maintenanceDailyCommitment.findUnique({
    where: { id: commitmentId },
    include: { cards: true },
  });
  if (!commitment || commitment.reportSentAt) return;

  const total = commitment.cards.length;
  const executados = commitment.cards.filter((c) => c.executionStatus === "EXECUTADA").length;
  const pct = total > 0 ? Math.round((executados / total) * 100) : 0;
  const conformidadeDepois = await calcularConformidadeAtual(commitment.tenantId);

  await prisma.maintenanceDailyCommitment.update({
    where: { id: commitment.id },
    data: { conformidadeDepois, reportSentAt: new Date() },
  });

  const antes = commitment.conformidadeAntes ?? "—";
  await notificarTodosDoTenant(commitment.tenantId, {
    title: "📋 Resultado Diário da Manutenção",
    body: `${pct}% da programação de hoje concluída (${executados}/${total} itens). Conformidade geral: ${antes}% → ${conformidadeDepois}%.`,
    data: { view: "performance" },
  });
}
