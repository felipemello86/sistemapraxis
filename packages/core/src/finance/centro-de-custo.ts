// Rateio de custos entre Unidades — pedido do Felipe, 05/08/2026: hierarquia
// Administração -> Empreendimento -> Unidade. Um lançamento marcado
// "Administração" (sem propertyId/uhId) é um custo da operação como um todo
// — quando a DRE é vista POR Unidade ou POR Empreendimento, ele precisa ser
// dividido entre as Unidades ativas. Mesma lógica pra um lançamento marcado
// num Empreendimento específico, mas rateado só ENTRE AS UNIDADES DAQUELE
// EMPREENDIMENTO ("rateia-se apenas para as Unidades daquele Empreendimento
// selecionado").
//
// 06/08/2026 (pedido do Felipe): "Empreendimento" e "Unidade" deixaram de
// ser um cadastro próprio do Financeiro (FinanceEmpreendimento/
// FinanceUnidade, removidos) — usa o cadastro REAL de Property/UH do
// Gateway (Configurações > Unidades), já usado por Governança, Manutenção,
// Avaliações e Recepção.
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
  | { tipo: "EMPREENDIMENTO"; propertyId: string }
  | { tipo: "UNIDADE"; uhId: string };

export interface ContextoRateio {
  totalUnidadesAtivas: number;
  unidadesAtivasPorEmpreendimento: Map<string, number>; // propertyId -> contagem de UHs ativas
  empreendimentoDaUnidade: Map<string, string>; // uhId -> propertyId
}

/** Carrega as contagens de UHs que contam no rateio PARA O MÊS `mes`
 * (YYYY-MM) — uma consulta só, reaproveitada por toda a DRE daquele
 * tenant/mês. Uma UH entra no denominador se está `ativo=true` HOJE OU se
 * `mes` ainda é igual ou anterior ao mês em que foi desativada
 * (`desativadaEm` — o próprio mês de desativação ainda conta, só o mês
 * SEGUINTE já exclui, pedido do Felipe, 05/08/2026, generalizado pro
 * Gateway em 06/08/2026). O OR entre `ativo` e `desativadaEm` existe porque
 * — diferente da antiga FinanceUnidade, onde os dois campos eram sempre
 * mantidos em sincronia pela API do Financeiro — no Gateway `ativo` e
 * `desativadaEm` são setados independentemente; isso faz o rateio de meses
 * passados continuar correto mesmo depois que uma UH é desativada hoje,
 * mesmo que quem desativou não tenha preenchido `desativadaEm`. */
export async function carregarContextoRateio(tenantId: string, mes: string): Promise<ContextoRateio> {
  const uhs = await prisma.uH.findMany({
    where: { tenantId, OR: [{ ativo: true }, { desativadaEm: { gte: mes } }] },
    select: { id: true, propertyId: true },
  });

  const unidadesAtivasPorEmpreendimento = new Map<string, number>();
  const empreendimentoDaUnidade = new Map<string, string>();
  for (const u of uhs) {
    unidadesAtivasPorEmpreendimento.set(u.propertyId, (unidadesAtivasPorEmpreendimento.get(u.propertyId) ?? 0) + 1);
    empreendimentoDaUnidade.set(u.id, u.propertyId);
  }

  return { totalUnidadesAtivas: uhs.length, unidadesAtivasPorEmpreendimento, empreendimentoDaUnidade };
}

/** Fração (0 a 1) do valor de um lançamento que cabe ao filtro pedido. 0 =
 * lançamento fica inteiramente de fora da visão filtrada. GERAL sempre
 * retorna 1 — é a própria soma de tudo, sem rateio nenhum (a soma das
 * partes rateadas entre Empreendimentos/Unidades sempre bate com o Geral). */
export function fatorRateio(
  lancamento: { centroCustoTipo: string; propertyId: string | null; uhId: string | null },
  filtro: FiltroCentroCusto,
  ctx: ContextoRateio
): number {
  if (filtro.tipo === "GERAL") return 1;

  if (filtro.tipo === "EMPREENDIMENTO") {
    if (lancamento.centroCustoTipo === "UNIDADE") {
      const empreendimentoDaUnidade = lancamento.uhId ? ctx.empreendimentoDaUnidade.get(lancamento.uhId) : undefined;
      return empreendimentoDaUnidade === filtro.propertyId ? 1 : 0;
    }
    if (lancamento.centroCustoTipo === "EMPREENDIMENTO") {
      return lancamento.propertyId === filtro.propertyId ? 1 : 0;
    }
    // ADMINISTRACAO: rateia proporcionalmente — a fatia do empreendimento é
    // (unidades do empreendimento) / (total de unidades ativas do tenant).
    const unidadesDoEmpreendimento = ctx.unidadesAtivasPorEmpreendimento.get(filtro.propertyId) ?? 0;
    if (ctx.totalUnidadesAtivas === 0 || unidadesDoEmpreendimento === 0) return 0;
    return unidadesDoEmpreendimento / ctx.totalUnidadesAtivas;
  }

  // filtro.tipo === "UNIDADE"
  if (lancamento.centroCustoTipo === "UNIDADE") {
    return lancamento.uhId === filtro.uhId ? 1 : 0;
  }
  if (lancamento.centroCustoTipo === "EMPREENDIMENTO") {
    const empreendimentoDaUnidadeAlvo = ctx.empreendimentoDaUnidade.get(filtro.uhId);
    if (lancamento.propertyId !== empreendimentoDaUnidadeAlvo) return 0;
    const unidadesDoEmpreendimento = lancamento.propertyId ? ctx.unidadesAtivasPorEmpreendimento.get(lancamento.propertyId) ?? 0 : 0;
    return unidadesDoEmpreendimento === 0 ? 0 : 1 / unidadesDoEmpreendimento;
  }
  // ADMINISTRACAO: rateio igualitário entre TODAS as unidades ativas do tenant.
  return ctx.totalUnidadesAtivas === 0 ? 0 : 1 / ctx.totalUnidadesAtivas;
}
