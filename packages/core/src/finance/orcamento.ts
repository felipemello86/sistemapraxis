// Árvore de Orçamento (pedido do Felipe, 06/08/2026): mesma estrutura da
// DRE (Bloco -> Categoria), com um 3º nível dentro de cada categoria: os
// lançamentos PREVISTOS daquele mês (recorrentes projetados ou pontuais —
// mesma regra de lib/finance/conciliacao.ts: um previsto é só um
// FinanceLancamento MANUAL, ainda não pago) mais a "provisão de gastos não
// definidos" — que é o antigo FinanceOrcamento por categoria, agora
// reinterpretado como esse provisionamento (nada mudou no schema pra isso,
// já existia). Nada aqui é gravado: previstos cumpridos, consumo da
// provisão etc. são sempre calculados na hora da consulta.

import { prisma } from "../prisma";
import { Prisma } from "../../generated";
import { calcularDre, type DreLinhaLancamento } from "./dre";
import { limitesDoMes, projetarDataNoMes, ocorreNoMes } from "./mes";
import { carregarConciliacoesDoMes } from "./conciliacao";
import { carregarContextoRateio, fatorRateio, type FiltroCentroCusto, type ContextoRateio } from "./centro-de-custo";

// Objeto sintético só pra reaproveitar fatorRateio() na provisão de gastos
// não definidos (pedido do Felipe, 06/08/2026: Orçamento também deve ter
// Geral/Empreendimento/Unidade, igual a DRE). A provisão não tem centro de
// custo próprio no schema — é tratada como um custo de "Administração"
// (rateado igualmente entre as Unidades, ou entre as do Empreendimento
// selecionado), a mesma regra já usada pra qualquer lançamento sem
// Empreendimento/Unidade marcado.
const CENTRO_CUSTO_ADMINISTRACAO = { centroCustoTipo: "ADMINISTRACAO", propertyId: null, uhId: null };

const ZERO = new Prisma.Decimal(0);

export interface OrcamentoPrevistoItem {
  id: string;
  descricao: string;
  fornecedor: string | null;
  valor: Prisma.Decimal;
  dataEfetiva: string; // já projetada no mês, se recorrente
  recorrente: boolean;
  // true = já existe um lançamento REAL conciliado com este previsto neste
  // mês (ver conciliacao.ts) — a previsão foi cumprida, não conta mais
  // sozinha em "realizado" (só o real conta, pra não duplicar).
  cumprido: boolean;
  lancamentoRealId: string | null;
}

export interface OrcamentoCategoriaResumo {
  categoriaId: string;
  nome: string;
  tipo: string; // RECEITA | DESPESA
  blocoId: string;
  realizadoRS: Prisma.Decimal; // igual ao total que a DRE já calcula (deduplicado)
  // Lançamentos REAIS já conciliados/realizados nessa categoria/mês (mesma
  // lista que a DRE mostra) — pedido do Felipe, 06/08/2026: o 2º nível de
  // expand do Orçamento mostra isso junto com previstos e provisão.
  lancamentos: DreLinhaLancamento[];
  previstos: OrcamentoPrevistoItem[];
  totalPrevistosRS: Prisma.Decimal; // soma de todos os previstos (cumpridos ou não)
  provisaoRS: Prisma.Decimal | null; // valor orçado pra "gastos não definidos" — null = nunca configurado
  // soma de lançamentos reais marcados "Lançamento Diverso" (sem previsão
  // específica) nessa categoria/mês — sempre positivo (magnitude), pra
  // subtrair direto da provisaoRS (que também é positiva).
  provisaoConsumidaRS: Prisma.Decimal;
  provisaoRestanteRS: Prisma.Decimal | null; // provisaoRS - provisaoConsumidaRS (pode ficar negativo se estourou)
  // Projeção de fechamento do mês (pedido do Felipe, 06/08/2026: a provisão
  // deve "sensibilizar os valores exibidos em Orçamento") = realizado +
  // previstos AINDA pendentes (os já cumpridos já estão dentro de
  // realizado, não conta 2x) + provisão restante (o que ainda "sobra" pra
  // imprevistos, pode ser negativo se já estourou). Só exibição, nunca
  // gravado.
  projetadoRS: Prisma.Decimal;
}

export interface OrcamentoBlocoResumo {
  blocoId: string;
  nome: string;
  ordem: number;
  totalizador: string;
  realizadoRS: Prisma.Decimal;
  projetadoRS: Prisma.Decimal;
  categorias: OrcamentoCategoriaResumo[];
}

export interface OrcamentoMensal {
  mes: string;
  blocos: OrcamentoBlocoResumo[];
  // Mesmos 4 totais + margem % da DRE (pedido do Felipe, 06/08/2026: a tela
  // de Orçamento também deve mostrar Lucro/Prejuízo, Margem etc, não só os
  // blocos) — vêm direto do cálculo da DRE deste mês, nada recalculado aqui.
  margemBrutaRS: Prisma.Decimal;
  margemBrutaPercent: Prisma.Decimal | null;
  despesasRS: Prisma.Decimal;
  geracaoDeCaixaRS: Prisma.Decimal;
  lucroPrejuizoRS: Prisma.Decimal;
  // Mesmos 4 totais, porém PROJETADOS (ver OrcamentoCategoriaResumo.projetadoRS).
  margemBrutaProjetadoRS: Prisma.Decimal;
  margemBrutaProjetadoPercent: Prisma.Decimal | null;
  despesasProjetadoRS: Prisma.Decimal;
  geracaoDeCaixaProjetadoRS: Prisma.Decimal;
  lucroPrejuizoProjetadoRS: Prisma.Decimal;
}

export async function calcularOrcamento(tenantId: string, mes: string, filtroCentroCusto?: FiltroCentroCusto): Promise<OrcamentoMensal> {
  const filtro: FiltroCentroCusto = filtroCentroCusto ?? { tipo: "GERAL" };
  const { inicio, fim } = limitesDoMes(mes);

  const [dre, categorias, provisoes, pontuais, recorrentes, fulfilled, diversosDoMes, ctxRateio] = await Promise.all([
    calcularDre(tenantId, mes, filtro),
    prisma.financeCategoria.findMany({ where: { tenantId } }),
    prisma.financeOrcamento.findMany({ where: { tenantId, mes, alvoTipo: "CATEGORIA" } }),
    prisma.financeLancamento.findMany({
      where: { tenantId, origem: "MANUAL", recorrente: false, dataVencimento: { gte: inicio, lte: fim } },
    }),
    prisma.financeLancamento.findMany({
      where: {
        tenantId,
        origem: "MANUAL",
        recorrente: true,
        dataVencimento: { lte: fim },
        OR: [{ recorrenciaFimData: null }, { recorrenciaFimData: { gte: inicio } }],
      },
    }),
    carregarConciliacoesDoMes(tenantId, mes),
    prisma.financeLancamento.findMany({
      where: { tenantId, origem: "PLUGGY", conciliadoDiverso: true, dataVencimento: { gte: inicio, lte: fim } },
    }),
    filtro.tipo === "GERAL" ? Promise.resolve(null as ContextoRateio | null) : carregarContextoRateio(tenantId, mes),
  ]);

  const categoriaPorId = new Map(categorias.map((c) => [c.id, c]));

  // "Realizado" da DRE inclui TODO lançamento MANUAL do mês, pago ou não —
  // é assim que a projeção de recorrência sempre funcionou (aparece na DRE
  // desde a criação, não só depois de pago). Mas a seção "Realizado" do
  // Orçamento (pedido do Felipe, 06/08/2026) deve mostrar só o que já foi
  // DE FATO conciliado — um previsto MANUAL ainda pendente já aparece na
  // seção "Previstos" logo abaixo, não deveria aparecer duplicado aqui.
  const previstosNaoConciliadosIds = new Set([...pontuais, ...recorrentes].filter((l) => !fulfilled.has(l.id)).map((l) => l.id));

  // Provisão não tem Empreendimento/Unidade própria — rateada como um custo
  // de Administração (ver comentário de CENTRO_CUSTO_ADMINISTRACAO acima).
  const fatorProvisao = ctxRateio ? fatorRateio(CENTRO_CUSTO_ADMINISTRACAO, filtro, ctxRateio) : 1;
  const provisaoPorCategoria = new Map(
    provisoes
      .filter((o) => o.categoriaId)
      .map((o) => [o.categoriaId as string, fatorProvisao === 1 ? o.valor : o.valor.mul(fatorProvisao)] as const)
  );

  const previstosPorCategoria = new Map<string, OrcamentoPrevistoItem[]>();
  function addPrevisto(categoriaId: string | null, item: OrcamentoPrevistoItem) {
    if (!categoriaId) return; // previsto sem categoria não entra na árvore, mesma regra da DRE (pendentesCategorizacao)
    const arr = previstosPorCategoria.get(categoriaId) ?? [];
    arr.push(item);
    previstosPorCategoria.set(categoriaId, arr);
  }

  for (const l of pontuais) {
    const fator = ctxRateio ? fatorRateio(l, filtro, ctxRateio) : 1;
    if (fator === 0) continue; // fora do Empreendimento/Unidade filtrado
    addPrevisto(l.categoriaId, {
      id: l.id,
      descricao: l.descricao,
      fornecedor: l.fornecedor,
      valor: fator === 1 ? l.valor : l.valor.mul(fator),
      dataEfetiva: l.dataVencimento,
      recorrente: false,
      cumprido: fulfilled.has(l.id),
      lancamentoRealId: fulfilled.get(l.id) ?? null,
    });
  }
  for (const l of recorrentes) {
    const raizEstaNesteMes = l.dataVencimento >= inicio && l.dataVencimento <= fim;
    if (!raizEstaNesteMes && !ocorreNoMes(l.dataVencimento, l.recorrenciaFrequencia, mes)) continue; // ANUAL: só nos meses com o mês-calendário da raiz
    const fator = ctxRateio ? fatorRateio(l, filtro, ctxRateio) : 1;
    if (fator === 0) continue;
    addPrevisto(l.categoriaId, {
      id: l.id,
      descricao: l.descricao,
      fornecedor: l.fornecedor,
      valor: fator === 1 ? l.valor : l.valor.mul(fator),
      dataEfetiva: raizEstaNesteMes ? l.dataVencimento : projetarDataNoMes(l.dataVencimento, mes),
      recorrente: true,
      cumprido: fulfilled.has(l.id),
      lancamentoRealId: fulfilled.get(l.id) ?? null,
    });
  }

  // Consumo da provisão "não definida" — só cálculo/exibição, nada é
  // gravado (mesmo espírito da DRE e do rateio: tudo somado ao vivo). Cada
  // lançamento "diverso" já tem seu próprio centro de custo (definido na
  // hora que foi categorizado em Lançamentos) — mesmo fatorRateio da DRE.
  const consumidoPorCategoria = new Map<string, Prisma.Decimal>();
  for (const l of diversosDoMes) {
    if (!l.categoriaId) continue;
    const fator = ctxRateio ? fatorRateio(l, filtro, ctxRateio) : 1;
    if (fator === 0) continue;
    const valorRateado = fator === 1 ? l.valor.abs() : l.valor.abs().mul(fator);
    consumidoPorCategoria.set(l.categoriaId, (consumidoPorCategoria.get(l.categoriaId) ?? ZERO).add(valorRateado));
  }

  function montarCategoria(
    categoriaId: string,
    nome: string,
    tipo: string,
    blocoId: string,
    realizadoRS: Prisma.Decimal,
    lancamentos: DreLinhaLancamento[]
  ): OrcamentoCategoriaResumo {
    const previstos = (previstosPorCategoria.get(categoriaId) ?? []).sort((a, b) => a.dataEfetiva.localeCompare(b.dataEfetiva));
    const totalPrevistosRS = previstos.reduce((acc, p) => acc.add(p.valor), ZERO);
    const provisaoRS = provisaoPorCategoria.get(categoriaId) ?? null;
    const provisaoConsumidaRS = consumidoPorCategoria.get(categoriaId) ?? ZERO;
    const provisaoRestanteRS = provisaoRS != null ? provisaoRS.sub(provisaoConsumidaRS) : null;
    // Projeção de fechamento (ver comentário na interface): IMPORTANTE —
    // `realizadoRS` (vindo da DRE) JÁ inclui todo previsto MANUAL ainda não
    // pago (é assim que a "DRE viva" sempre funcionou: um lançamento
    // recorrente ou pontual futuro já aparece projetado na DRE do mês desde
    // a criação do módulo, não só depois de pago — só é excluído quando
    // CONCILIADO com um real, pra não contar 2x). Por isso o projetado NÃO
    // soma os previstos de novo aqui (isso duplicaria); só soma o que ainda
    // não tem representação nenhuma na DRE: a folga da provisão de gastos
    // não definidos.
    const projetadoRS = realizadoRS.add(provisaoRestanteRS ?? ZERO);
    return {
      categoriaId,
      nome,
      tipo,
      blocoId,
      realizadoRS,
      lancamentos,
      previstos,
      totalPrevistosRS,
      provisaoRS,
      provisaoConsumidaRS,
      provisaoRestanteRS,
      projetadoRS,
    };
  }

  const blocos: OrcamentoBlocoResumo[] = dre.blocos.map((blocoDre) => {
    const categoriasDoBloco: OrcamentoCategoriaResumo[] = blocoDre.categorias.map((catDre) =>
      montarCategoria(
        catDre.categoriaId,
        catDre.nome,
        catDre.tipo,
        blocoDre.blocoId,
        catDre.total,
        catDre.lancamentos.filter((l) => !previstosNaoConciliadosIds.has(l.id))
      )
    );

    // A DRE só lista categorias com lançamento REALIZADO no mês — mas uma
    // categoria pode ter previsto/provisão configurados e ainda não ter
    // nada realizado (é literalmente o caso de uso: planejar antes de
    // acontecer). Sem isso, a previsão "sumiria" da tela até o gasto
    // realmente ocorrer.
    const jaIncluidas = new Set(categoriasDoBloco.map((c) => c.categoriaId));
    for (const categoria of categorias) {
      if (categoria.blocoId !== blocoDre.blocoId || jaIncluidas.has(categoria.id)) continue;
      const temPrevisto = (previstosPorCategoria.get(categoria.id) ?? []).length > 0;
      const temProvisao = provisaoPorCategoria.has(categoria.id);
      if (!temPrevisto && !temProvisao) continue; // nada pra mostrar, não polui a árvore
      categoriasDoBloco.push(montarCategoria(categoria.id, categoria.nome, categoria.tipo, blocoDre.blocoId, ZERO, []));
    }

    categoriasDoBloco.sort((a, b) => (categoriaPorId.get(a.categoriaId)?.ordem ?? 0) - (categoriaPorId.get(b.categoriaId)?.ordem ?? 0));

    // bloco.total (realizado) já vem multiplicado pelo `sinal` do bloco (ver
    // dre.ts, categoria.total é bruto/sem sinal) — o projetado precisa da
    // MESMA multiplicação, em cima da soma bruta (pré-sinal) das categorias,
    // pra ficar na mesma unidade/convenção do realizado.
    const somaProjetadaBruta = categoriasDoBloco.reduce((acc, c) => acc.add(c.projetadoRS), ZERO);

    return {
      blocoId: blocoDre.blocoId,
      nome: blocoDre.nome,
      ordem: blocoDre.ordem,
      totalizador: blocoDre.totalizador,
      realizadoRS: blocoDre.total,
      projetadoRS: somaProjetadaBruta.mul(blocoDre.sinal),
      categorias: categoriasDoBloco,
    };
  });

  const somarProjetadoPorTotalizador = (totalizador: string) =>
    blocos.filter((b) => b.totalizador === totalizador).reduce((acc, b) => acc.add(b.projetadoRS), ZERO);

  const margemBrutaProjetadoRS = somarProjetadoPorTotalizador("MARGEM_BRUTA");
  const despesasProjetadoRS = somarProjetadoPorTotalizador("DESPESAS");
  const geracaoDeCaixaProjetadoRS = margemBrutaProjetadoRS.add(despesasProjetadoRS);
  const lucroPrejuizoProjetadoRS = geracaoDeCaixaProjetadoRS.add(somarProjetadoPorTotalizador("LUCRO_PREJUIZO_EXTRA"));

  const receitaBrutaProjetadaRS = blocos
    .filter((b) => b.totalizador === "MARGEM_BRUTA")
    .flatMap((b) => b.categorias)
    .filter((c) => c.tipo === "RECEITA")
    .reduce((acc, c) => acc.add(c.projetadoRS), ZERO);
  const margemBrutaProjetadoPercent = receitaBrutaProjetadaRS.isZero() ? null : margemBrutaProjetadoRS.dividedBy(receitaBrutaProjetadaRS).mul(100);

  return {
    mes,
    blocos,
    margemBrutaRS: dre.margemBrutaRS,
    margemBrutaPercent: dre.margemBrutaPercent,
    despesasRS: dre.despesasRS,
    geracaoDeCaixaRS: dre.geracaoDeCaixaRS,
    lucroPrejuizoRS: dre.lucroPrejuizoRS,
    margemBrutaProjetadoRS,
    margemBrutaProjetadoPercent,
    despesasProjetadoRS,
    geracaoDeCaixaProjetadoRS,
    lucroPrejuizoProjetadoRS,
  };
}
