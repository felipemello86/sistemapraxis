import { notificarPorRoles, notificarTodosDoTenant, prisma } from "@praxis/core";

// Lógica compartilhada entre a Server Action que executa o último card do
// dia (apps/maintenance/src/app/actions/correcao.ts) e o cron de 19h
// (apps/maintenance/src/app/api/cron/resultado-diario/route.ts) — os dois
// gatilhos descritos pelo Felipe pro "Resultado Diário da Manutenção" ("ao
// executar o último card do dia OU às 19h, o que vier primeiro"). Fica num
// módulo comum (em vez de só na Server Action) porque uma rota de API não
// pode importar uma função de um arquivo "use server" que não seja ela
// mesma uma Server Action.
//
// notificarTodosDoTenant/notificarPorRoles foram promovidas pra
// @praxis/core (packages/core/src/notify.ts) — reexportadas aqui só pra não
// quebrar quem já importa deste arquivo (correcao.ts).
export { notificarPorRoles, notificarTodosDoTenant };

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

  // Denominador do % é o congelado no fechamento do dia (totalPrevisto), não
  // o total ao vivo de commitment.cards — cards intempestivos/urgentes
  // adicionados depois (previsto=false, ver adicionarCardUrgenteAction)
  // contam só no numerador, podendo levar o % acima de 100% (pedido
  // explícito do Felipe: 10 previstos + 1 não previsto executado = 110%).
  const executados = commitment.cards.filter((c) => c.executionStatus === "EXECUTADA").length;
  const totalPrevisto = commitment.totalPrevisto;
  const pct = totalPrevisto > 0 ? Math.round((executados / totalPrevisto) * 100) : 0;
  const naoPrevistoExecutados = commitment.cards.filter((c) => !c.previsto && c.executionStatus === "EXECUTADA").length;
  const naoPrevistoTotal = commitment.cards.filter((c) => !c.previsto).length;
  const conformidadeDepois = await calcularConformidadeAtual(commitment.tenantId);

  await prisma.maintenanceDailyCommitment.update({
    where: { id: commitment.id },
    data: { conformidadeDepois, reportSentAt: new Date() },
  });

  const antes = commitment.conformidadeAntes ?? "—";
  const extraTexto = naoPrevistoTotal > 0 ? `, +${naoPrevistoExecutados}/${naoPrevistoTotal} não previstos` : "";
  await notificarTodosDoTenant(commitment.tenantId, {
    title: "📋 Resultado Diário da Manutenção",
    body: `${pct}% da programação de hoje concluída (${executados}/${totalPrevisto} previstos${extraTexto}). Conformidade geral: ${antes}% → ${conformidadeDepois}%.`,
    data: { view: "performance" },
  });
}
