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
 * UHs com inspeção em atraso de um tenant — mesmo critério de
 * "pendente"/"Em Atraso" da tela Informações (informacoes.tsx: dias===null
 * || dias>=maxDias, só sobre Inspeção real, avulsa=false, ver
 * ultimaInspecaoRealPorUnidade em apps/maintenance/src/lib/domain.ts).
 * Reimplementado aqui direto sobre Prisma (mesmo padrão de
 * calcularConformidadeAtual acima) porque roda em contexto de
 * servidor/cron, sem o array já carregado no client.
 */
export async function listarUHsEmAtraso(tenantId: string) {
  const [config, unidades, inspecoes] = await Promise.all([
    prisma.maintenanceConfig.findUnique({ where: { tenantId } }),
    prisma.uH.findMany({ where: { tenantId, ativo: true }, select: { id: true, numero: true } }),
    prisma.maintenanceInspection.findMany({
      where: { tenantId, avulsa: false },
      select: { uhId: true, date: true },
    }),
  ]);
  const maxDias = config?.maxDaysBetweenInspections ?? 90;

  const ultimaPorUnidade = new Map<string, Date>();
  for (const insp of inspecoes) {
    const atual = ultimaPorUnidade.get(insp.uhId);
    if (!atual || insp.date > atual) ultimaPorUnidade.set(insp.uhId, insp.date);
  }

  const agora = Date.now();
  return unidades
    .map((u) => {
      const ultima = ultimaPorUnidade.get(u.id) ?? null;
      const dias = ultima ? Math.floor((agora - ultima.getTime()) / (1000 * 60 * 60 * 24)) : null;
      return { uhId: u.id, uhNumero: u.numero, dias, pendente: dias === null || dias >= maxDias };
    })
    .filter((l) => l.pendente)
    .sort((a, b) => (b.dias ?? Infinity) - (a.dias ?? Infinity));
}

/**
 * Notifica Gerente/Governanta/Master se houver alguma UH com inspeção em
 * atraso — chamada pelo cron das 8h (api/cron/inspecoes-atrasadas/route.ts).
 * Pedido explícito do Felipe: "às 8am, se houver alguma UH com inspeção em
 * atraso, emitir notificação para Gerente, Governanta e Master." Não envia
 * nada se a lista estiver vazia (sem alarme falso todo dia).
 */
export async function notificarInspecoesEmAtrasoSeHouver(tenantId: string) {
  const uhsEmAtraso = await listarUHsEmAtraso(tenantId);
  if (uhsEmAtraso.length === 0) return 0;

  const exemplos = uhsEmAtraso
    .slice(0, 5)
    .map((u) => `UH ${u.uhNumero}`)
    .join(", ");
  const resto = uhsEmAtraso.length > 5 ? ` e mais ${uhsEmAtraso.length - 5}` : "";

  await notificarPorRoles(tenantId, ["GERENTE", "GOVERNANTA", "MASTER"], {
    title: "🕒 Inspeções em atraso",
    body: `${uhsEmAtraso.length} UH${uhsEmAtraso.length === 1 ? "" : "s"} com inspeção em atraso: ${exemplos}${resto}.`,
    data: { view: "informacoes" },
  });
  return uhsEmAtraso.length;
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
  const uhsEmAtraso = await listarUHsEmAtraso(commitment.tenantId);

  await prisma.maintenanceDailyCommitment.update({
    where: { id: commitment.id },
    data: {
      conformidadeDepois,
      reportSentAt: new Date(),
      uhsEmAtrasoSnapshot: JSON.stringify(uhsEmAtraso.map((u) => ({ uhNumero: u.uhNumero, dias: u.dias }))),
    },
  });

  const antes = commitment.conformidadeAntes ?? "—";
  const extraTexto = naoPrevistoTotal > 0 ? `, +${naoPrevistoExecutados}/${naoPrevistoTotal} não previstos` : "";
  const atrasoTexto = uhsEmAtraso.length > 0 ? ` ${uhsEmAtraso.length} UH(s) com inspeção em atraso.` : "";
  await notificarTodosDoTenant(commitment.tenantId, {
    title: "📋 Resultado Diário da Manutenção",
    body: `${pct}% da programação de hoje concluída (${executados}/${totalPrevisto} previstos${extraTexto}). Conformidade geral: ${antes}% → ${conformidadeDepois}%.${atrasoTexto}`,
    data: { view: "performance" },
  });
}
