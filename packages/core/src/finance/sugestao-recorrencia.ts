// Sugestão automática de RECORRÊNCIA pra um lançamento pendente de
// conciliação (pedido do Felipe, 06/08/2026: "use a inteligência do sistema
// e o backup do conta azul para pré-configurar a recorrência (...) isso vai
// me poupar muito trabalho"). Mesmo espírito de sugestao-categoria.ts, mas
// combina DUAS fontes de sinal em vez de uma só:
//
//   1. HISTÓRICO AO VIVO (recalculado a cada consulta, sem tabela própria):
//      agrupa o histórico já categorizado por descrição+fornecedor (mesma
//      chave de sugestao-categoria.ts) e olha o padrão de datas de
//      vencimento de cada grupo — se aparece em >=3 meses distintos com gap
//      mediano de ~30 dias, é bem provável que seja uma cobrança mensal
//      (aluguel, assinatura...); ~365 dias, uma cobrança anual (seguro,
//      IPTU...). Esse sinal cresce sozinho conforme mais meses de dado real
//      (Pluggy) vão se acumulando no sistema.
//
//   2. CONTA AZUL (tabela FinanceRegraRecorrencia, POR GRUPO, populada uma
//      única vez pelo script scripts/importar-recorrencia-conta-azul.ts) —
//      cobre o caso em que o histórico ao vivo AINDA não tem 3 ocorrências
//      (o módulo Financeiro é novo, poucos meses de Pluggy sincronizado) mas
//      o Felipe já sabia, no Conta Azul, que aquela cobrança era recorrente.
//      Ver comentário em FinanceRegraRecorrencia (schema.prisma) pra por que
//      isso não vira `recorrente=true` direto num FinanceLancamento.
//
// As duas fontes são independentes e se reforçam: se AMBAS concordam que é
// recorrente, a confiança sobe (origem "ambos"). Nenhuma das duas jamais
// escreve nada sozinha — o resultado aqui só pré-preenche o popup "Repetir
// Lançamento" da tela de Conciliações; quem confirma (ou desliga) é sempre
// o Felipe, na hora de conciliar (requisito 6 da spec: categorização/decisão
// final é sempre humana).

import { prisma } from "../prisma";
import { chaveAgrupamento } from "./texto";

export interface SugestaoRecorrencia {
  recorrente: boolean;
  frequencia: "MENSAL" | "ANUAL";
  origem: "historico" | "conta_azul" | "ambos";
  confianca: number; // 0-100, só informativo (diferente da sugestão de categoria, não há limiar mínimo aqui — o toggle pré-marcado é sempre revisável/reversível de graça no popup antes de conciliar)
}

const MAX_HISTORICO = 5000;
const MIN_OCORRENCIAS = 3; // menos que isso é ruído demais (podia ser coincidência de 2 compras avulsas ~1 mês de intervalo)

/** Alias — este módulo nasceu antes de chaveAgrupamento virar compartilhada
 * em texto.ts; mantido pra não quebrar scripts/importar-recorrencia-conta-azul.ts
 * (que já importa `chaveRecorrencia` daqui) e qualquer outro import
 * existente. Mesma função, mesmo resultado de sugestao-categoria.ts e
 * sugestao-centro-custo.ts. */
export const chaveRecorrencia = chaveAgrupamento;

function diffDias(a: string, b: string): number {
  const [a1, a2, a3] = a.split("-").map(Number);
  const [b1, b2, b3] = b.split("-").map(Number);
  return Math.round((Date.UTC(a1, a2 - 1, a3) - Date.UTC(b1, b2 - 1, b3)) / 86400000);
}

function mediana(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** A partir das datas de vencimento (uma por ocorrência histórica) de um
 * grupo, tenta reconhecer um padrão MENSAL (~30 dias) ou ANUAL (~365 dias)
 * — usa o gap MEDIANO entre ocorrências consecutivas (não a média, nem
 * exige TODO gap dentro da faixa) pra tolerar um mês pulado sem quebrar a
 * detecção. */
// Exportada (além de usada aqui dentro) porque
// scripts/importar-recorrencia-conta-azul.ts reaproveita a MESMA lógica pra
// classificar a frequência de um grupo a partir das datas dos lançamentos
// REAIS que casaram com o Conta Azul — evita duas implementações do mesmo
// cálculo divergindo com o tempo.
export function detectarPadrao(datas: string[]): { frequencia: "MENSAL" | "ANUAL"; confianca: number } | null {
  const unicas = [...new Set(datas)].sort();
  if (unicas.length < MIN_OCORRENCIAS) return null;
  const gaps: number[] = [];
  for (let i = 1; i < unicas.length; i++) gaps.push(diffDias(unicas[i], unicas[i - 1]));
  const gapMediano = mediana(gaps);
  if (gapMediano >= 25 && gapMediano <= 35) return { frequencia: "MENSAL", confianca: Math.min(95, 55 + unicas.length * 8) };
  if (gapMediano >= 340 && gapMediano <= 390) return { frequencia: "ANUAL", confianca: Math.min(90, 50 + unicas.length * 10) };
  return null;
}

async function construirIndiceHistorico(tenantId: string): Promise<Map<string, string[]>> {
  const historico = await prisma.financeLancamento.findMany({
    where: { tenantId, categoriaId: { not: null } },
    select: { descricao: true, fornecedor: true, dataVencimento: true },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORICO,
  });
  const porGrupo = new Map<string, string[]>();
  for (const h of historico) {
    const chave = chaveRecorrencia(h.descricao, h.fornecedor);
    const lista = porGrupo.get(chave);
    if (lista) lista.push(h.dataVencimento);
    else porGrupo.set(chave, [h.dataVencimento]);
  }
  return porGrupo;
}

/** Versão em lote (mesmo padrão de sugerirCategoriasEmLote): constrói os
 * dois índices UMA vez só e sugere pra vários lançamentos de uma vez. Só
 * entra no Map resultado quem teve algum sinal de recorrência (histórico
 * e/ou Conta Azul) — quem não teve fica de fora, e o front trata isso como
 * "sem sugestão" (popup começa desligado, comportamento de sempre). */
export async function sugerirRecorrenciaEmLote(
  tenantId: string,
  itens: { id: string; descricao: string; fornecedor?: string | null }[]
): Promise<Map<string, SugestaoRecorrencia>> {
  const resultado = new Map<string, SugestaoRecorrencia>();
  if (itens.length === 0) return resultado;

  const [indiceHistorico, regras] = await Promise.all([
    construirIndiceHistorico(tenantId),
    prisma.financeRegraRecorrencia.findMany({ where: { tenantId } }),
  ]);
  const regraPorChave = new Map(regras.map((r) => [r.chave, r]));

  for (const item of itens) {
    const chave = chaveRecorrencia(item.descricao, item.fornecedor);
    const padraoHistorico = detectarPadrao(indiceHistorico.get(chave) ?? []);
    const regraContaAzul = regraPorChave.get(chave) ?? null;

    if (padraoHistorico && regraContaAzul?.recorrente) {
      resultado.set(item.id, { recorrente: true, frequencia: padraoHistorico.frequencia, origem: "ambos", confianca: Math.max(padraoHistorico.confianca, 80) });
    } else if (padraoHistorico) {
      resultado.set(item.id, { recorrente: true, frequencia: padraoHistorico.frequencia, origem: "historico", confianca: padraoHistorico.confianca });
    } else if (regraContaAzul?.recorrente) {
      const frequencia = regraContaAzul.frequencia === "ANUAL" ? "ANUAL" : "MENSAL";
      resultado.set(item.id, { recorrente: true, frequencia, origem: "conta_azul", confianca: 70 });
    }
    // regraContaAzul existe mas recorrente=false, sem padrão ao vivo: não
    // sugere nada (fica desligado, o padrão de sempre) — "Sem recorrência"
    // no Conta Azul é só ausência de sinal positivo, não é um sinal
    // negativo forte o bastante pra sobrepor uma eventual mudança de hábito.
  }

  return resultado;
}
