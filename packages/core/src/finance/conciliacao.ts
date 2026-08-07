// Conciliação (pedido do Felipe, 06/08/2026): todo lançamento importado
// (origem=PLUGGY) precisa ser pareado com o lançamento PREVISTO que ele
// cumpre — um previsto não é uma entidade separada, é só um FinanceLancamento
// MANUAL, recorrente OU pontual, ainda não pago, cuja Data de Vencimento (ou
// a projeção dela, se recorrente) cai naquele mês. Ver comentário em
// FinanceLancamento no schema.prisma pros 3 campos que guardam o resultado
// da conciliação (conciliadoComId/conciliadoMesReferencia/conciliadoDiverso)
// — todos vivem no lançamento REAL, nunca no previsto.

import { prisma } from "../prisma";
import { Prisma } from "../../generated";
import { limitesDoMes, projetarDataNoMes, ocorreNoMes, calcularFimRecorrencia } from "./mes";
import { tokensSignificativos } from "./texto";
import { sugerirCategoriasEmLote, type SugestaoCategoria } from "./sugestao-categoria";
import { sugerirRecorrenciaEmLote, type SugestaoRecorrencia } from "./sugestao-recorrencia";
import { sugerirCentroCustoEmLote, type SugestaoCentroCusto } from "./sugestao-centro-custo";

function diffDias(a: string, b: string): number {
  const [a1, a2, a3] = a.split("-").map(Number);
  const [b1, b2, b3] = b.split("-").map(Number);
  return Math.round((Date.UTC(a1, a2 - 1, a3) - Date.UTC(b1, b2 - 1, b3)) / 86400000);
}

export interface PrevistoCandidato {
  id: string;
  descricao: string;
  fornecedor: string | null;
  valor: Prisma.Decimal;
  dataEfetiva: string; // já projetada no mês em questão, se recorrente
  recorrente: boolean;
  categoriaId: string | null;
  confianca: number; // 0-100, heurística (valor + data + texto)
}

/** Lançamentos PREVISTOS (manuais, ainda não pagos) que caem no mês `mes` —
 * pontuais com dataVencimento no mês, ou recorrentes projetados nele. Não
 * filtra por "já cumprido" — quem precisa disso combina com
 * carregarConciliacoesDoMes(). */
async function buscarPrevistosDoMes(tenantId: string, mes: string) {
  const { inicio, fim } = limitesDoMes(mes);

  const [pontuais, recorrentes] = await Promise.all([
    prisma.financeLancamento.findMany({
      where: { tenantId, origem: "MANUAL", recorrente: false, pago: false, dataVencimento: { gte: inicio, lte: fim } },
    }),
    prisma.financeLancamento.findMany({
      where: {
        tenantId,
        origem: "MANUAL",
        recorrente: true,
        pago: false,
        dataVencimento: { lte: fim },
        OR: [{ recorrenciaFimData: null }, { recorrenciaFimData: { gte: inicio } }],
      },
    }),
  ]);

  return [
    ...pontuais.map((l) => ({ ...l, dataEfetiva: l.dataVencimento })),
    // ANUAL (pedido do Felipe, 06/08/2026): só é candidato nos meses cujo
    // mês-calendário bate com o da raiz — senão uma recorrência anual (ex.:
    // IPTU em janeiro) seria sugerida como candidata em todo mês do ano.
    ...recorrentes.filter((l) => ocorreNoMes(l.dataVencimento, l.recorrenciaFrequencia, mes)).map((l) => ({ ...l, dataEfetiva: projetarDataNoMes(l.dataVencimento, mes) })),
  ];
}

/** Mapa previstoId -> id do lançamento real que já o cumpriu NESSE mês
 * específico. Reaproveitada por: aqui mesmo (não sugerir previsto já
 * cumprido de novo), dre.ts (não contar previsto + real juntos) e
 * orcamento.ts (marcar "cumprido" na árvore do Orçamento). */
export async function carregarConciliacoesDoMes(tenantId: string, mes: string): Promise<Map<string, string>> {
  const conciliados = await prisma.financeLancamento.findMany({
    where: { tenantId, conciliadoMesReferencia: mes, conciliadoComId: { not: null } },
    select: { id: true, conciliadoComId: true },
  });
  const mapa = new Map<string, string>();
  for (const c of conciliados) if (c.conciliadoComId) mapa.set(c.conciliadoComId, c.id);
  return mapa;
}

function calcularConfianca(
  real: { valor: Prisma.Decimal; dataVencimento: string; descricao: string; fornecedor: string | null },
  candidato: { valor: Prisma.Decimal; dataEfetiva: string; descricao: string; fornecedor: string | null }
): number {
  const valorReal = Number(real.valor);
  const valorCandidato = Number(candidato.valor);
  // sinais diferentes (uma despesa, uma receita) nunca é o mesmo lançamento
  if (valorReal !== 0 && valorCandidato !== 0 && Math.sign(valorReal) !== Math.sign(valorCandidato)) return 0;

  const diffValor = Math.abs(Math.abs(valorReal) - Math.abs(valorCandidato));
  const diffValorPercent = Math.abs(valorCandidato) > 0 ? diffValor / Math.abs(valorCandidato) : diffValor > 0 ? 1 : 0;

  let pontos = 0;
  if (diffValor < 0.01) pontos += 60;
  else if (diffValorPercent <= 0.05) pontos += 40;
  else if (diffValorPercent <= 0.15) pontos += 15;

  const diasDiff = Math.abs(diffDias(real.dataVencimento, candidato.dataEfetiva));
  if (diasDiff === 0) pontos += 25;
  else if (diasDiff <= 3) pontos += 15;
  else if (diasDiff <= 7) pontos += 5;

  const toksReal = tokensSignificativos(`${real.descricao} ${real.fornecedor ?? ""}`);
  const toksCand = tokensSignificativos(`${candidato.descricao} ${candidato.fornecedor ?? ""}`);
  if (toksCand.length > 0 && toksReal.some((t) => toksCand.includes(t))) pontos += 15;

  return Math.min(100, pontos);
}

function paraCandidato(
  p: { id: string; descricao: string; fornecedor: string | null; valor: Prisma.Decimal; dataEfetiva: string; recorrente: boolean; categoriaId: string | null },
  real: { valor: Prisma.Decimal; dataVencimento: string; descricao: string; fornecedor: string | null }
): PrevistoCandidato {
  return {
    id: p.id,
    descricao: p.descricao,
    fornecedor: p.fornecedor,
    valor: p.valor,
    dataEfetiva: p.dataEfetiva,
    recorrente: p.recorrente,
    categoriaId: p.categoriaId,
    confianca: calcularConfianca(real, p),
  };
}

/** Sugestões de conciliação pra UM lançamento real específico (usado pelo
 * ícone de conciliação em Lançamentos) — candidatos com confiança > 0,
 * maior primeiro. */
export async function sugerirConciliacao(tenantId: string, lancamentoId: string): Promise<PrevistoCandidato[]> {
  const real = await prisma.financeLancamento.findUnique({ where: { id: lancamentoId } });
  if (!real || real.tenantId !== tenantId) return [];

  const mes = (real.dataCompetencia || real.dataVencimento).slice(0, 7);
  const [previstosDoMes, fulfilled] = await Promise.all([buscarPrevistosDoMes(tenantId, mes), carregarConciliacoesDoMes(tenantId, mes)]);

  return previstosDoMes
    .filter((p) => p.id !== real.id && !fulfilled.has(p.id))
    .map((p) => paraCandidato(p, real))
    .filter((c) => c.confianca > 0)
    .sort((a, b) => b.confianca - a.confianca);
}

/** Todos os lançamentos PLUGGY ainda não conciliados (nem por match
 * específico, nem marcados diverso) — usado pela tela /conciliacoes.
 * `mes` opcional filtra pelo mês de competência. Cada item já vem com a
 * lista de sugestões (a melhor primeiro). */
export async function listarPendentesDeConciliacao(tenantId: string, mes?: string) {
  const filtroMes = mes ? limitesDoMes(mes) : null;

  const pendentes = await prisma.financeLancamento.findMany({
    where: {
      tenantId,
      origem: "PLUGGY",
      conciliadoComId: null,
      conciliadoDiverso: false,
      ...(filtroMes ? { dataVencimento: { gte: filtroMes.inicio, lte: filtroMes.fim } } : {}),
    },
    orderBy: { dataVencimento: "desc" },
    take: 500,
  });

  // agrupa por mês de competência pra não repetir a busca de previstos por
  // lançamento — normalmente cai em só alguns meses distintos.
  const mesesEnvolvidos = new Set(pendentes.map((p) => (p.dataCompetencia || p.dataVencimento).slice(0, 7)));
  const previstosPorMes = new Map<string, Awaited<ReturnType<typeof buscarPrevistosDoMes>>>();
  const fulfilledPorMes = new Map<string, Map<string, string>>();
  await Promise.all(
    Array.from(mesesEnvolvidos).map(async (m) => {
      const [previstos, fulfilled] = await Promise.all([buscarPrevistosDoMes(tenantId, m), carregarConciliacoesDoMes(tenantId, m)]);
      previstosPorMes.set(m, previstos);
      fulfilledPorMes.set(m, fulfilled);
    })
  );

  // Sugestão de Categoria a partir do histórico já categorizado do tenant
  // (pedido do Felipe, 06/08/2026: "o sistema tem que ir aprendendo o que
  // cada descrição normalmente é em termos de categoria") — pré-preenche o
  // campo Categoria do card "Novo lançamento" antes do usuário mexer em
  // qualquer coisa. Só quem já tem categoriaId (foi categorizado antes, ex.:
  // via tela de categorização em lote) não precisa de sugestão — o
  // frontend usa o categoriaId existente do lançamento com prioridade.
  // payeeMcc/pluggyCategoria/pluggyMerchantCategoria (natureza do
  // estabelecimento, pedido do Felipe, 06/08/2026) entram como sinal A MAIS
  // na sugestão, ao lado do texto — ver tokenMcc/tokenPluggyCategoria/
  // tokenMerchantCategoria em sugestao-categoria.ts.
  const semCategoria = pendentes
    .filter((p) => !p.categoriaId)
    .map((p) => ({
      id: p.id,
      descricao: p.descricao,
      fornecedor: p.fornecedor,
      payeeMcc: p.pluggyPayeeMcc,
      pluggyCategoria: p.pluggyCategoria,
      pluggyMerchantCategoria: p.pluggyMerchantCategoria,
    }));
  const sugestoesCategoria = await sugerirCategoriasEmLote(tenantId, semCategoria);

  // Sugestão de Recorrência (pedido do Felipe, 06/08/2026: "use a
  // inteligência do sistema e o backup do conta azul para pré-configurar a
  // recorrência (...) isso vai me poupar muito trabalho") — pré-preenche o
  // popup "Repetir Lançamento" de CADA pendente (não só quem ainda não tem
  // categoria, diferente da sugestão de categoria acima) combinando padrão
  // ao vivo no histórico + tabela FinanceRegraRecorrencia (seedada do Conta
  // Azul) — ver sugestao-recorrencia.ts.
  const sugestoesRecorrencia = await sugerirRecorrenciaEmLote(
    tenantId,
    pendentes.map((p) => ({ id: p.id, descricao: p.descricao, fornecedor: p.fornecedor }))
  );

  // Sugestão de Centro de Custo (pedido do Felipe, 06/08/2026: "aproveite
  // também os dados de centro de custo") — mesmo espírito das anteriores,
  // ver sugestao-centro-custo.ts. Só entra quem ainda está no default
  // ADMINISTRACAO sem UH/Empreendimento específico — quem já tem um centro
  // de custo próprio (ex.: veio do backfill do Conta Azul) não precisa de
  // sugestão.
  const semCentroCusto = pendentes
    .filter((p) => p.centroCustoTipo === "ADMINISTRACAO" && !p.propertyId && !p.uhId)
    .map((p) => ({ id: p.id, descricao: p.descricao, fornecedor: p.fornecedor, valor: Number(p.valor) }));
  const sugestoesCentroCusto = await sugerirCentroCustoEmLote(tenantId, semCentroCusto);

  return pendentes.map((real) => {
    const m = (real.dataCompetencia || real.dataVencimento).slice(0, 7);
    const fulfilled = fulfilledPorMes.get(m) ?? new Map();
    const candidatos = (previstosPorMes.get(m) ?? [])
      .filter((p) => !fulfilled.has(p.id))
      .map((p) => paraCandidato(p, real))
      .filter((c) => c.confianca > 0)
      .sort((a, b) => b.confianca - a.confianca);

    const categoriaSugerida: SugestaoCategoria | null = sugestoesCategoria.get(real.id) ?? null;
    const recorrenciaSugerida: SugestaoRecorrencia | null = sugestoesRecorrencia.get(real.id) ?? null;
    const centroCustoSugerida: SugestaoCentroCusto | null = sugestoesCentroCusto.get(real.id) ?? null;

    return { lancamento: real, sugestoes: candidatos, melhorSugestao: candidatos[0] ?? null, categoriaSugerida, recorrenciaSugerida, centroCustoSugerida };
  });
}

/** Confirma a conciliação de um lançamento real com um previsto específico
 * (o usuário aceitou a sugestão, ou escolheu outro previsto na mão). */
export async function confirmarConciliacao(tenantId: string, lancamentoId: string, previstoId: string, mesReferencia: string) {
  const [real, previsto] = await Promise.all([
    prisma.financeLancamento.findUnique({ where: { id: lancamentoId } }),
    prisma.financeLancamento.findUnique({ where: { id: previstoId } }),
  ]);
  if (!real || real.tenantId !== tenantId) throw new Error("Lançamento não encontrado");
  if (!previsto || previsto.tenantId !== tenantId) throw new Error("Previsto não encontrado");
  if (previsto.origem !== "MANUAL") throw new Error("Só é possível conciliar com um lançamento previsto (manual)");
  if (previsto.id === real.id) throw new Error("Um lançamento não pode ser conciliado consigo mesmo");

  return prisma.financeLancamento.update({
    where: { id: lancamentoId },
    data: { conciliadoComId: previstoId, conciliadoMesReferencia: mesReferencia, conciliadoDiverso: false },
  });
}

/** Marca um lançamento real como "Lançamento Diverso" — revisado, mas sem
 * previsão específica correspondente. Passa a consumir a provisão de
 * gastos não definidos da categoria dele (ver orcamento.ts). */
export async function marcarComoDiverso(tenantId: string, lancamentoId: string) {
  const real = await prisma.financeLancamento.findUnique({ where: { id: lancamentoId } });
  if (!real || real.tenantId !== tenantId) throw new Error("Lançamento não encontrado");

  return prisma.financeLancamento.update({
    where: { id: lancamentoId },
    data: { conciliadoComId: null, conciliadoMesReferencia: null, conciliadoDiverso: true },
  });
}

/** Desfaz a conciliação (com previsto específico ou diverso) — volta a
 * "pendente", pra revisar de novo. */
export async function desfazerConciliacao(tenantId: string, lancamentoId: string) {
  const real = await prisma.financeLancamento.findUnique({ where: { id: lancamentoId } });
  if (!real || real.tenantId !== tenantId) throw new Error("Lançamento não encontrado");

  return prisma.financeLancamento.update({
    where: { id: lancamentoId },
    data: { conciliadoComId: null, conciliadoMesReferencia: null, conciliadoDiverso: false },
  });
}

// Novo fluxo "Novo lançamento" (pedido do Felipe, 06/08/2026, redesign da
// tela de Conciliações espelhando o Conta Azul): quando o sistema não
// sugere nenhum previsto pra um lançamento importado (ou o usuário prefere
// não usar a sugestão), a tela oferece criar um previsto NOVO ali mesmo —
// com categoria, centro de custo e, opcionalmente, recorrência (pra virar
// uma expectativa nos meses seguintes no Orçamento) — e já conciliar o
// lançamento importado com ele, numa operação só.
export interface NovoLancamentoConciliacao {
  descricao: string;
  fornecedor?: string | null;
  categoriaId: string;
  centroCustoTipo?: string; // ADMINISTRACAO (default) | EMPREENDIMENTO | UNIDADE
  propertyId?: string | null;
  uhId?: string | null;
  dataVencimento: string; // YYYY-MM-DD — "1º vencimento" do popup (raiz da recorrência, se houver)
  recorrente?: boolean;
  recorrenciaFrequencia?: string; // MENSAL (default) | ANUAL — só relevante se recorrente
  recorrenciaQtde?: number | null; // null/undefined = infinito; N = calcula recorrenciaFimData (ver mes.ts)
  contaBancariaId?: string | null;
  formaPagamento?: string | null;
  observacoes?: string | null;
  // Comprovante/nota fiscal (pedido do Felipe, 06/08/2026) — já vem pronto
  // do upload direto pro Cloudinary (ver uploadAnexo.ts no app), aqui só
  // serializa em JSON pro campo `anexos` (mesmo padrão de
  // ComplaintOcorrencia.anexos).
  anexos?: { url: string; fileName: string; fileSize: number }[];
  // Compra parcelada (pedido do Felipe, 06/08/2026): algumas compras no
  // cartão chegam da Pluggy com a descrição começando em "Parcelado..." e
  // o VALOR TOTAL da compra (ex.: R$1.978,20 numa compra em 6x), quando só
  // a fatia deste mês (R$329,70) deveria contar nas contas — o resto são
  // as próximas 5 parcelas, que ainda vão chegar em faturas futuras. Se
  // informado, `valorParcela` substitui `real.valor` tanto no previsto
  // criado quanto no PRÓPRIO lançamento real importado (ver abaixo) — a
  // recorrência (MENSAL, `recorrenciaQtde` parcelas restantes) continua
  // sendo configurada do jeito normal pelos campos acima.
  valorParcela?: number;
}

/** Cria um FinanceLancamento MANUAL novo (o "previsto") e já concilia o
 * lançamento importado (`lancamentoRealId`) com ele — pedido do Felipe,
 * 06/08/2026, card "Novo lançamento" da tela de Conciliações. O valor é
 * normalmente copiado do lançamento real (a proposta é sempre "isto que já
 * aconteceu passa a ser esperado também nos próximos meses", nunca um
 * valor arbitrário digitado à parte) — só descrição/fornecedor podem ser
 * ajustados em relação ao texto bruto importado do banco. A EXCEÇÃO é
 * compra parcelada (`dados.valorParcela`, ver comentário no tipo acima):
 * aí o valor vem de uma conta (total ÷ parcelas), não do texto bruto. */
export async function criarEConciliar(tenantId: string, lancamentoRealId: string, dados: NovoLancamentoConciliacao) {
  const real = await prisma.financeLancamento.findUnique({ where: { id: lancamentoRealId } });
  if (!real || real.tenantId !== tenantId) throw new Error("Lançamento não encontrado");
  if (real.origem !== "PLUGGY") throw new Error("Só é possível criar um novo lançamento previsto a partir de um lançamento importado");
  if (real.conciliadoComId || real.conciliadoDiverso) throw new Error("Este lançamento já está conciliado — desfaça a conciliação atual antes de criar um novo previsto");

  if (!dados.descricao?.trim()) throw new Error("descricao é obrigatória");

  const categoria = await prisma.financeCategoria.findUnique({ where: { id: dados.categoriaId } });
  if (!categoria || categoria.tenantId !== tenantId) throw new Error("Categoria não encontrada");

  const centroCustoTipo = dados.centroCustoTipo ?? "ADMINISTRACAO";
  if (!["ADMINISTRACAO", "EMPREENDIMENTO", "UNIDADE"].includes(centroCustoTipo)) {
    throw new Error("centroCustoTipo deve ser ADMINISTRACAO, EMPREENDIMENTO ou UNIDADE");
  }
  let propertyId: string | null = null;
  let uhId: string | null = null;
  if (centroCustoTipo === "EMPREENDIMENTO") {
    if (!dados.propertyId) throw new Error("propertyId é obrigatório quando centroCustoTipo=EMPREENDIMENTO");
    const property = await prisma.property.findUnique({ where: { id: dados.propertyId } });
    if (!property || property.tenantId !== tenantId) throw new Error("Empreendimento não encontrado");
    propertyId = dados.propertyId;
  } else if (centroCustoTipo === "UNIDADE") {
    if (!dados.uhId) throw new Error("uhId é obrigatório quando centroCustoTipo=UNIDADE");
    const uh = await prisma.uH.findUnique({ where: { id: dados.uhId } });
    if (!uh || uh.tenantId !== tenantId) throw new Error("Unidade não encontrada");
    uhId = dados.uhId;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.dataVencimento ?? "")) throw new Error("dataVencimento inválida (esperado YYYY-MM-DD)");

  const recorrente = Boolean(dados.recorrente);
  const recorrenciaFrequencia = dados.recorrenciaFrequencia ?? "MENSAL";
  if (recorrente && !["MENSAL", "ANUAL"].includes(recorrenciaFrequencia)) {
    throw new Error("recorrenciaFrequencia deve ser MENSAL ou ANUAL");
  }
  const recorrenciaFimData = recorrente ? calcularFimRecorrencia(dados.dataVencimento, recorrenciaFrequencia, dados.recorrenciaQtde ?? null) : null;

  // Compra parcelada: valida e substitui o valor (ver comentário no tipo
  // NovoLancamentoConciliacao). O sinal tem que bater com o do lançamento
  // real (uma despesa parcelada continua despesa em cada parcela) —
  // proteção contra bug no cálculo do front (total ÷ parcelas já devia vir
  // com o sinal certo, mas não custa checar antes de gravar).
  let valorFinal = real.valor;
  if (dados.valorParcela != null) {
    if (!Number.isFinite(dados.valorParcela) || dados.valorParcela === 0) throw new Error("valorParcela inválido");
    const mesmoSinal = Math.sign(dados.valorParcela) === Math.sign(Number(real.valor));
    if (!mesmoSinal) throw new Error("valorParcela precisa ter o mesmo sinal do lançamento real (despesa continua negativa, receita continua positiva)");
    valorFinal = new Prisma.Decimal(dados.valorParcela);
  }

  const previsto = await prisma.financeLancamento.create({
    data: {
      tenantId,
      categoriaId: dados.categoriaId,
      descricao: dados.descricao.trim(),
      fornecedor: dados.fornecedor?.trim() || real.fornecedor,
      valor: valorFinal,
      dataVencimento: dados.dataVencimento,
      recorrente,
      recorrenciaFrequencia,
      recorrenciaFimData,
      origem: "MANUAL",
      centroCustoTipo,
      propertyId,
      uhId,
      contaBancariaId: dados.contaBancariaId || null,
      formaPagamento: dados.formaPagamento?.trim() || null,
      observacoes: dados.observacoes?.trim() || null,
      anexos: JSON.stringify(dados.anexos ?? []),
    },
  });

  // Corrige o valor do PRÓPRIO lançamento real importado pra fatia deste
  // mês (não a compra inteira) — sem isso o mês da compra ficaria com a
  // despesa total (ex.: R$1.978,20) e os meses seguintes, cobertos só pelo
  // previsto recorrente criado acima, não fechariam com o que a Pluggy vai
  // reportar em cada fatura futura (ex.: R$329,70 cada).
  if (dados.valorParcela != null) {
    await prisma.financeLancamento.update({ where: { id: lancamentoRealId }, data: { valor: valorFinal } });
  }

  const mesReferencia = (real.dataCompetencia || real.dataVencimento).slice(0, 7);
  await confirmarConciliacao(tenantId, lancamentoRealId, previsto.id, mesReferencia);

  return previsto;
}
