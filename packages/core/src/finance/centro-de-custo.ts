// Rateio de custos entre Unidades — pedido do Felipe, 05/08/2026: hierarquia
// Administração -> Empreendimento -> Unidade. Um lançamento marcado
// "Administração" (sem empreendimentoId/unidadeId) é um custo da operação
// como um todo — quando a DRE é vista POR Unidade ou POR Empreendimento, ele
// precisa ser dividido entre as Unidades ativas. Mesma lógica pra um
// lançamento marcado num Empreendimento específico, mas rateado só ENTRE AS
// UNIDADES DAQUELE EMPREENDIMENTO ("rateia-se apenas para as Unidades
// daquele Empreendimento selecionado").
//
// Nada disso é gravado no banco — é recalculado a cada consulta da DRE, a
// partir da contagem ATUAL de Unidades ativas. Se uma Unidade for criada ou
// desativada, o rateio de TODOS os meses (passados e futuros) muda
// automaticamente na próxima consulta — é assim que "rateado de forma
// igualitária" foi pedido, não uma alocação fixa travada no momento do
// lançamento.

import { prisma } from "../prisma";

export type FiltroCentroCusto =
  | { tipo: "GERAL" }
  | { tipo: "EMPREENDIMENTO"; empreendimentoId: string }
  | { tipo: "UNIDADE"; unidadeId: string };

export interface ContextoRateio {
  totalUnidadesAtivas: number;
  unidadesAtivasPorEmpreendimento: Map<string, number>;
  empreendimentoDaUnidade: Map<string, string>; // unidadeId -> empreendimentoId
}

/** Carrega as contagens de Unidades que contam no rateio PARA O MÊS `mes`
 * (YYYY-MM) — uma consulta só, reaproveitada por toda a DRE daquele
 * tenant/mês. Uma Unidade entra no denominador se nunca foi desativada
 * (desativadaEm null) OU se `mes` ainda é igual ou anterior ao mês em que
 * foi desativada (o próprio mês de desativação ainda conta — só o mês
 * SEGUINTE já exclui, pedido do Felipe, 05/08/2026). Isso faz o rateio de
 * meses passados continuar correto mesmo depois que uma Unidade é
 * desativada hoje. */
export async function carregarContextoRateio(tenantId: string, mes: string): Promise<ContextoRateio> {
  const unidades = await prisma.financeUnidade.findMany({
    where: { tenantId, OR: [{ desativadaEm: null }, { desativadaEm: { gte: mes } }] },
    select: { id: true, empreendimentoId: true },
  });

  const unidadesAtivasPorEmpreendimento = new Map<string, number>();
  const empreendimentoDaUnidade = new Map<string, string>();
  for (const u of unidades) {
    unidadesAtivasPorEmpreendimento.set(u.empreendimentoId, (unidadesAtivasPorEmpreendimento.get(u.empreendimentoId) ?? 0) + 1);
    empreendimentoDaUnidade.set(u.id, u.empreendimentoId);
  }

  return { totalUnidadesAtivas: unidades.length, unidadesAtivasPorEmpreendimento, empreendimentoDaUnidade };
}

/** Fração (0 a 1) do valor de um lançamento que cabe ao filtro pedido. 0 =
 * lançamento fica inteiramente de fora da visão filtrada. GERAL sempre
 * retorna 1 — é a própria soma de tudo, sem rateio nenhum (a soma das
 * partes rateadas entre Empreendimentos/Unidades sempre bate com o Geral). */
export function fatorRateio(
  lancamento: { centroCustoTipo: string; empreendimentoId: string | null; unidadeId: string | null },
  filtro: FiltroCentroCusto,
  ctx: ContextoRateio
): number {
  if (filtro.tipo === "GERAL") return 1;

  if (filtro.tipo === "EMPREENDIMENTO") {
    if (lancamento.centroCustoTipo === "UNIDADE") {
      const empreendimentoDaUnidade = lancamento.unidadeId ? ctx.empreendimentoDaUnidade.get(lancamento.unidadeId) : undefined;
      return empreendimentoDaUnidade === filtro.empreendimentoId ? 1 : 0;
    }
    if (lancamento.centroCustoTipo === "EMPREENDIMENTO") {
      return lancamento.empreendimentoId === filtro.empreendimentoId ? 1 : 0;
    }
    // ADMINISTRACAO: rateia proporcionalmente — a fatia do empreendimento é
    // (unidades do empreendimento) / (total de unidades ativas do tenant).
    const unidadesDoEmpreendimento = ctx.unidadesAtivasPorEmpreendimento.get(filtro.empreendimentoId) ?? 0;
    if (ctx.totalUnidadesAtivas === 0 || unidadesDoEmpreendimento === 0) return 0;
    return unidadesDoEmpreendimento / ctx.totalUnidadesAtivas;
  }

  // filtro.tipo === "UNIDADE"
  if (lancamento.centroCustoTipo === "UNIDADE") {
    return lancamento.unidadeId === filtro.unidadeId ? 1 : 0;
  }
  if (lancamento.centroCustoTipo === "EMPREENDIMENTO") {
    const empreendimentoDaUnidadeAlvo = ctx.empreendimentoDaUnidade.get(filtro.unidadeId);
    if (lancamento.empreendimentoId !== empreendimentoDaUnidadeAlvo) return 0;
    const unidadesDoEmpreendimento = lancamento.empreendimentoId ? ctx.unidadesAtivasPorEmpreendimento.get(lancamento.empreendimentoId) ?? 0 : 0;
    return unidadesDoEmpreendimento === 0 ? 0 : 1 / unidadesDoEmpreendimento;
  }
  // ADMINISTRACAO: rateio igualitário entre TODAS as unidades ativas do tenant.
  return ctx.totalUnidadesAtivas === 0 ? 0 : 1 / ctx.totalUnidadesAtivas;
}
