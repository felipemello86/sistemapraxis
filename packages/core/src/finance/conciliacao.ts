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
import { limitesDoMes, projetarDataNoMes } from "./mes";

function normalizar(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(s: string): string[] {
  return normalizar(s)
    .replace(/\d+\s*\/\s*\d+/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter((t) => t.length >= 4);
}

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
    ...recorrentes.map((l) => ({ ...l, dataEfetiva: projetarDataNoMes(l.dataVencimento, mes) })),
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

  const toksReal = tokens(`${real.descricao} ${real.fornecedor ?? ""}`);
  const toksCand = tokens(`${candidato.descricao} ${candidato.fornecedor ?? ""}`);
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

  return pendentes.map((real) => {
    const m = (real.dataCompetencia || real.dataVencimento).slice(0, 7);
    const fulfilled = fulfilledPorMes.get(m) ?? new Map();
    const candidatos = (previstosPorMes.get(m) ?? [])
      .filter((p) => !fulfilled.has(p.id))
      .map((p) => paraCandidato(p, real))
      .filter((c) => c.confianca > 0)
      .sort((a, b) => b.confianca - a.confianca);

    return { lancamento: real, sugestoes: candidatos, melhorSugestao: candidatos[0] ?? null };
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
