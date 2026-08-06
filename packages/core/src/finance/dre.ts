// Motor de cálculo da "DRE viva" — pedido do Felipe, 05/08/2026. Não são
// regras contábeis oficiais, são as regras de gestão dele (ver requisito 9
// da spec original). Duas peças fazem o trabalho pesado deste arquivo:
//
//   1. Referência temporal = Data de Vencimento (requisito 3): uma DRE de um
//      mês é a soma de todo FinanceLancamento cuja dataVencimento cai
//      naquele mês. Parcelas já são linhas próprias no banco (uma por mês —
//      ver seed/CRUD), então não precisam de projeção nenhuma aqui.
//
//   2. Recorrência (requisito 4) é o caso que PRECISA de projeção: existe
//      uma única linha no banco (recorrente=true), e este módulo "aparece"
//      ela virtualmente em todo mês a partir da dataVencimento original até
//      recorrenciaFimData (ou indefinidamente). Nada é gravado no banco pra
//      isso — é recalculado a cada consulta.
//
// Fórmula da DRE (05/08/2026 — desde a introdução dos blocos configuráveis,
// os NOMES destes 4 totais são fixos, mas a COMPOSIÇÃO é dado, não código:
// cada FinanceBloco decide, via seu campo `totalizador`, em qual desses 4
// totais entra, e via `sinal` (1 ou -1) se soma ou subtrai — ver tela de
// Configurações. Isto substitui o antigo enum fixo DRE_BLOCOS):
//
//   Margem Bruta      = Σ blocos com totalizador=MARGEM_BRUTA (×sinal)
//   Despesas          = Σ blocos com totalizador=DESPESAS (×sinal)
//   Geração de Caixa  = Margem Bruta + Despesas
//   Lucro/Prejuízo    = Geração de Caixa + Σ blocos com totalizador=LUCRO_PREJUIZO_EXTRA (×sinal)
//
// Margem Bruta % = Margem Bruta ÷ (receita operacional bruta), onde
// "receita operacional bruta" é a soma de tudo que é tipo=RECEITA dentro dos
// blocos do totalizador MARGEM_BRUTA (ex.: Diárias, Reserva Direta... —
// exclui receitas financeiras, que vivem em LUCRO_PREJUIZO_EXTRA). Pedido
// explícito do Felipe, 05/08/2026.
//
// (Os valores já vêm com sinal embutido — despesa é negativa, receita é
// positiva —, então "somar tudo" já é a operação certa a maior parte do
// tempo; o `sinal` do bloco é uma inversão extra por cima disso, opcional.)

import { prisma } from "../prisma";
import { Prisma } from "../../generated";
import type { DreTotalizador } from "./categoria-defaults";
import { carregarContextoRateio, fatorRateio, type FiltroCentroCusto } from "./centro-de-custo";
import { limitesDoMes, projetarDataNoMes, ocorreNoMes } from "./mes";
import { carregarConciliacoesDoMes } from "./conciliacao";

const ZERO = new Prisma.Decimal(0);

// Ordem de exibição dos totalizadores no fluxo da DRE (não é alfabética —
// segue a mesma sequência da planilha do Felipe: Margem Bruta primeiro,
// Despesas depois, Lucro/Prejuízo por último). Bug real encontrado em
// produção (05/08/2026): ordenar só por `ordem` intercala blocos de
// totalizadores diferentes porque cada grupo reinicia a numeração em 1 —
// "Despesas com Funcionários" (DESPESAS, ordem 1) e "Despesas com
// Diretoria" (LUCRO_PREJUIZO_EXTRA, ordem 1) empatavam e a ordem final
// ficava arbitrária. Corrigido ordenando por totalizador (nesta sequência
// fixa) e só depois por `ordem` dentro do grupo.
const RANK_TOTALIZADOR: Record<string, number> = { MARGEM_BRUTA: 0, DESPESAS: 1, LUCRO_PREJUIZO_EXTRA: 2 };
function ordenarBlocos<T extends { totalizador: string; ordem: number }>(blocos: T[]): T[] {
  return [...blocos].sort((a, b) => (RANK_TOTALIZADOR[a.totalizador] ?? 99) - (RANK_TOTALIZADOR[b.totalizador] ?? 99) || a.ordem - b.ordem);
}

export interface DreLinhaLancamento {
  id: string;
  categoriaId: string | null;
  descricao: string;
  fornecedor: string | null;
  valor: Prisma.Decimal;
  dataEfetiva: string; // YYYY-MM-DD dentro do mês consultado
  projetadaDeRecorrencia: boolean; // true = ocorrência virtual (mês diferente do lançamento raiz)
  // Pedido do Felipe, 06/08/2026 — popup "Buscar lançamento" da tela de
  // Conciliações: precisa distinguir, sem lógica própria no frontend,
  // quais linhas da DRE são candidatas válidas pra virar o "previsto" de
  // uma conciliação (ver confirmarConciliacao em conciliacao.ts, que exige
  // origem=MANUAL). `origem` vem direto do lançamento; `conciliavel` já
  // resolve a regra completa (MANUAL e ainda sem um real conciliado nesse
  // mês) pra a UI só desabilitar/marcar visualmente, nunca reimplementar.
  origem: string; // MANUAL | PLUGGY
  conciliavel: boolean;
}

export interface DreCategoriaResumo {
  categoriaId: string;
  nome: string;
  tipo: string; // RECEITA | DESPESA
  blocoId: string;
  total: Prisma.Decimal;
  orcado: Prisma.Decimal | null;
  lancamentos: DreLinhaLancamento[];
}

export interface DreBlocoResumo {
  blocoId: string;
  nome: string;
  ordem: number;
  totalizador: DreTotalizador;
  sinal: number;
  total: Prisma.Decimal; // já multiplicado pelo `sinal` do bloco
  orcado: Prisma.Decimal | null;
  categorias: DreCategoriaResumo[];
}

export interface DreMensal {
  mes: string; // YYYY-MM
  blocos: DreBlocoResumo[];
  margemBrutaRS: Prisma.Decimal;
  margemBrutaPercent: Prisma.Decimal | null; // null quando não há receita bruta no mês (divisão por zero)
  despesasRS: Prisma.Decimal;
  geracaoDeCaixaRS: Prisma.Decimal;
  lucroPrejuizoRS: Prisma.Decimal;
  // categoriaId nulo — vieram da varredura Pluggy e ainda não foram
  // categorizados (requisito 6: sistema deve "provocar" o Felipe pra
  // resolver isso). Não entram em nenhum bloco/rollup até serem
  // categorizados.
  pendentesCategorizacao: DreLinhaLancamento[];
}

// Aritmética de mês (limitesDoMes/mesAdjacente/somarMeses/projetarDataNoMes)
// mora em ./mes.ts desde 06/08/2026 — extraída pra lib/finance/conciliacao.ts
// poder reaproveitar sem criar import circular (ver comentário em ./mes.ts).
// Reexportada aqui pra ninguém que já importa daqui (ou de @praxis/core)
// precisar mudar.
export * from "./mes";

/** Calcula a DRE de um tenant para um mês específico (passado, atual ou
 * futuro — mesma função pras três situações, requisito 2).
 *
 * `filtroCentroCusto` (pedido do Felipe, 05/08/2026): default GERAL (soma
 * de tudo, sem rateio). Filtrando por Empreendimento ou Unidade, cada
 * lançamento entra só com a fatia que cabe àquele filtro — ver
 * lib/finance/centro-de-custo.ts pra fórmula do rateio (lançamento marcado
 * numa Unidade específica vai 100% pra ela; marcado num Empreendimento ou
 * em "Administração" é dividido entre as Unidades relevantes). */
export async function calcularDre(tenantId: string, mes: string, filtroCentroCusto?: FiltroCentroCusto): Promise<DreMensal> {
  const filtro: FiltroCentroCusto = filtroCentroCusto ?? { tipo: "GERAL" };
  const { inicio, fim } = limitesDoMes(mes);

  const [blocosDoTenant, categorias, lancamentosDoMes, candidatosRecorrentes, orcamentosDoMes] = await Promise.all([
    prisma.financeBloco.findMany({ where: { tenantId } }),
    prisma.financeCategoria.findMany({ where: { tenantId } }),
    prisma.financeLancamento.findMany({
      where: { tenantId, recorrente: false, dataVencimento: { gte: inicio, lte: fim } },
    }),
    prisma.financeLancamento.findMany({
      where: {
        tenantId,
        recorrente: true,
        dataVencimento: { lte: fim },
        OR: [{ recorrenciaFimData: null }, { recorrenciaFimData: { gte: inicio } }],
      },
    }),
    prisma.financeOrcamento.findMany({ where: { tenantId, mes } }),
  ]);

  const categoriaPorId = new Map(categorias.map((c) => [c.id, c]));

  // Só busca a contagem de Unidades ativas quando o filtro precisa dela
  // (GERAL não rateia nada — economiza uma consulta no caso comum).
  const ctxRateio = filtro.tipo === "GERAL" ? null : await carregarContextoRateio(tenantId, mes);

  // Conciliação (pedido do Felipe, 06/08/2026): um lançamento PREVISTO
  // (manual, recorrente ou pontual) que já foi CUMPRIDO por um lançamento
  // real nesse mês específico não pode contar sozinho na DRE — senão o
  // gasto aparece 2x (a previsão E a execução). Só o real conta; a previsão
  // some da soma "realizado" (mas continua aparecendo na tela de Orçamento,
  // marcada como cumprida — ver lib/finance/orcamento.ts).
  const fulfilled = await carregarConciliacoesDoMes(tenantId, mes);

  const linhas: DreLinhaLancamento[] = [];

  for (const l of lancamentosDoMes) {
    if (l.origem === "MANUAL" && fulfilled.has(l.id)) continue; // previsto pontual já cumprido por um real neste mês
    const fator = ctxRateio ? fatorRateio(l, filtro, ctxRateio) : 1;
    if (fator === 0) continue; // fora do Empreendimento/Unidade filtrado
    linhas.push({
      id: l.id,
      categoriaId: l.categoriaId,
      descricao: l.descricao,
      fornecedor: l.fornecedor,
      valor: fator === 1 ? l.valor : l.valor.mul(fator),
      dataEfetiva: l.dataVencimento,
      projetadaDeRecorrencia: false,
      origem: l.origem,
      conciliavel: l.origem === "MANUAL", // já filtramos os fulfilled acima, então todo MANUAL que sobrou ainda está pendente
    });
  }

  for (const l of candidatosRecorrentes) {
    if (l.origem === "MANUAL" && fulfilled.has(l.id)) continue; // ocorrência recorrente deste mês já cumprida por um real
    const raizEstaNesteMes = l.dataVencimento >= inicio && l.dataVencimento <= fim;
    // ANUAL (pedido do Felipe, 06/08/2026): só "aparece" nos meses cujo
    // mês-calendário bate com o da raiz — a query já garante o intervalo
    // [dataVencimento, recorrenciaFimData], falta só filtrar o mês certo.
    if (!raizEstaNesteMes && !ocorreNoMes(l.dataVencimento, l.recorrenciaFrequencia, mes)) continue;
    const fator = ctxRateio ? fatorRateio(l, filtro, ctxRateio) : 1;
    if (fator === 0) continue;
    linhas.push({
      id: l.id,
      categoriaId: l.categoriaId,
      descricao: l.descricao,
      fornecedor: l.fornecedor,
      valor: fator === 1 ? l.valor : l.valor.mul(fator),
      dataEfetiva: raizEstaNesteMes ? l.dataVencimento : projetarDataNoMes(l.dataVencimento, mes),
      projetadaDeRecorrencia: !raizEstaNesteMes,
      origem: l.origem,
      conciliavel: l.origem === "MANUAL",
    });
  }

  const pendentesCategorizacao = linhas.filter((l) => l.categoriaId === null);

  const orcadoPorCategoria = new Map<string, Prisma.Decimal>();
  const orcadoPorBloco = new Map<string, Prisma.Decimal>();
  for (const o of orcamentosDoMes) {
    if (o.alvoTipo === "CATEGORIA") {
      orcadoPorCategoria.set(o.alvoChave, o.valor);
    } else if (o.alvoTipo === "BLOCO") {
      orcadoPorBloco.set(o.alvoChave, o.valor);
    }
  }

  // Agrupa por categoria (só lançamentos já categorizados)
  const linhasPorCategoria = new Map<string, DreLinhaLancamento[]>();
  for (const l of linhas) {
    if (!l.categoriaId) continue;
    const arr = linhasPorCategoria.get(l.categoriaId) ?? [];
    arr.push(l);
    linhasPorCategoria.set(l.categoriaId, arr);
  }

  const categoriasPorBloco = new Map<string, DreCategoriaResumo[]>();
  for (const [categoriaId, linhasDaCategoria] of linhasPorCategoria) {
    const categoria = categoriaPorId.get(categoriaId);
    if (!categoria) continue; // categoria foi apagada de fato (raro — ver onDelete: SetNull) — ignora, não quebra a DRE
    const total = linhasDaCategoria.reduce((acc, l) => acc.add(l.valor), ZERO);
    const resumo: DreCategoriaResumo = {
      categoriaId,
      nome: categoria.nome,
      tipo: categoria.tipo,
      blocoId: categoria.blocoId,
      total,
      orcado: orcadoPorCategoria.get(categoriaId) ?? null,
      lancamentos: linhasDaCategoria.sort((a, b) => a.dataEfetiva.localeCompare(b.dataEfetiva)),
    };
    const arr = categoriasPorBloco.get(categoria.blocoId) ?? [];
    arr.push(resumo);
    categoriasPorBloco.set(categoria.blocoId, arr);
  }

  // Ordena categorias dentro de cada bloco pela `ordem` do catálogo (mesma
  // ordem de exibição da planilha original)
  for (const arr of categoriasPorBloco.values()) {
    arr.sort((a, b) => (categoriaPorId.get(a.categoriaId)?.ordem ?? 0) - (categoriaPorId.get(b.categoriaId)?.ordem ?? 0));
  }

  const blocos: DreBlocoResumo[] = ordenarBlocos(blocosDoTenant).map((bloco) => {
    const categoriasDoBloco = categoriasPorBloco.get(bloco.id) ?? [];
    const totalBruto = categoriasDoBloco.reduce((acc, c) => acc.add(c.total), ZERO);
    return {
      blocoId: bloco.id,
      nome: bloco.nome,
      ordem: bloco.ordem,
      totalizador: bloco.totalizador as DreTotalizador,
      sinal: bloco.sinal,
      total: totalBruto.mul(bloco.sinal),
      orcado: orcadoPorBloco.get(bloco.id) ?? null,
      categorias: categoriasDoBloco,
    };
  });

  const somarPorTotalizador = (totalizador: DreTotalizador) =>
    blocos.filter((b) => b.totalizador === totalizador).reduce((acc, b) => acc.add(b.total), ZERO);

  const margemBrutaRS = somarPorTotalizador("MARGEM_BRUTA");
  const despesasRS = somarPorTotalizador("DESPESAS");
  const geracaoDeCaixaRS = margemBrutaRS.add(despesasRS);
  const lucroPrejuizoRS = geracaoDeCaixaRS.add(somarPorTotalizador("LUCRO_PREJUIZO_EXTRA"));

  // Margem Bruta % — só sobre a receita OPERACIONAL (tipo=RECEITA dentro
  // dos blocos que alimentam Margem Bruta), pra não diluir com receita
  // financeira (que vive em LUCRO_PREJUIZO_EXTRA e nem entra nesta conta).
  const receitaBrutaOperacionalRS = blocos
    .filter((b) => b.totalizador === "MARGEM_BRUTA")
    .flatMap((b) => b.categorias)
    .filter((c) => c.tipo === "RECEITA")
    .reduce((acc, c) => acc.add(c.total), ZERO);
  const margemBrutaPercent = receitaBrutaOperacionalRS.isZero() ? null : margemBrutaRS.dividedBy(receitaBrutaOperacionalRS).mul(100);

  return {
    mes,
    blocos,
    margemBrutaRS,
    margemBrutaPercent,
    despesasRS,
    geracaoDeCaixaRS,
    lucroPrejuizoRS,
    pendentesCategorizacao,
  };
}
