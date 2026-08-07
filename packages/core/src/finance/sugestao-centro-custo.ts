// Sugestão automática de CENTRO DE CUSTO (Empreendimento/Unidade) a partir
// do histórico já classificado do tenant — pedido do Felipe, 06/08/2026:
// "aproveite também os dados de centro de custo" (mesmo espírito das
// sugestões de categoria/MCC/recorrência já feitas antes nesta mesma
// rodada de pedidos).
//
// Diferente da sugestão de Categoria (sugestao-categoria.ts, que PRECISA de
// similaridade fuzzy por cosseno porque MUITAS descrições diferentes podem
// cair na mesma categoria — ex. "mercado", "farmácia", "posto" são todos
// "Despesas Operacionais"), centro de custo é quase 1:1: a MESMA
// descrição+fornecedor (ex.: "FABIO NUNES FERREIRA DEBITO TRANSF PIX")
// corresponde quase sempre ao MESMO imóvel/UH — então um voto majoritário
// EXATO por grupo (sem cosseno/idf) já é suficiente e, na prática, mais
// confiável (não arrisca "vazar" o centro de custo de um imóvel pro de
// outro só por parecença textual).
//
// O VALOR entra na chave de agrupamento (pedido do Felipe, 06/08/2026: "vc
// pode distinguir qual o centro de custo pelo valor do lançamento") — um
// proprietário com vários flats (ex. Fabio Nunes Ferreira, dono de ~9
// imóveis) manda a MESMA descrição de banco todo mês pra QUALQUER um deles;
// sem o valor, o histórico desse proprietário vira um único grupo com o
// voto espalhado entre todos os flats dele (confiança baixa demais,
// nenhuma sugestão). Cada imóvel tem um aluguel de valor diferente na
// prática (confirmado nos dados reais do tenant), então
// descrição+fornecedor+valor já separa a maioria dos casos em grupos
// unânimes de novo. Ainda sobra um resíduo real (o mesmo proprietário às
// vezes cobra o MESMO valor de dois flats diferentes) — nesse caso o voto
// majoritário só se aplica DIRETO se ainda assim um imóvel dominar o
// histórico daquele valor específico (>= MIN_CONFIANCA); quando nem isso
// (empate real entre 2+ imóveis), pedido do Felipe, 06/08/2026: "o sistema
// pode fazer o q eu mesmo faria: atribuir aleatoriamente mesmo" — sorteia
// entre os candidatos empatados, ponderado pela frequência histórica de
// cada um (não uniforme: um imóvel que aparece 3x mais que outro pro mesmo
// valor tem 3x mais chance de ser sorteado — é o palpite mais informado
// possível dado que não dá pra saber com certeza). O sorteio é
// DETERMINÍSTICO por lançamento (semente = o próprio id), não por chamada —
// senão a sugestão "piscaria" diferente a cada vez que a tela recarrega.
// Isso também significa que, ao longo de vários meses, os sorteios tendem a
// se distribuir entre os imóveis candidatos na mesma proporção do
// histórico, em vez de sempre "chutar" o mesmo errado.

import { prisma } from "../prisma";
import { chaveAgrupamento } from "./texto";

export interface SugestaoCentroCusto {
  centroCustoTipo: "EMPREENDIMENTO" | "UNIDADE";
  propertyId: string | null;
  uhId: string | null;
  confianca: number; // 0-100 = participação do escolhido entre os votos do grupo (100 = sempre o mesmo imóvel no histórico)
  origem: "maioria" | "sorteio"; // "sorteio" = empate real, escolhido por sorteio ponderado (ver comentário do topo)
}

const MAX_HISTORICO = 5000;
// Mais conservador que o limiar de Categoria (55%, ver sugestao-categoria.ts)
// — aqui o grupo é EXATO (mesma descrição+fornecedor+valor, não parecido),
// então se ainda assim o histórico está dividido entre dois imóveis
// diferentes é sinal de ambiguidade real (o mesmo proprietário cobrando o
// mesmo valor de mais de um flat). Acima do limiar, aplica direto (origem
// "maioria"); abaixo, sorteia entre os candidatos (origem "sorteio", ver
// sortearEntreEmpatados) em vez de deixar sem sugestão nenhuma.
const MIN_CONFIANCA = 60;

/** Hash determinístico simples (djb2) normalizado pra [0, 1) — usado como
 * "moeda" do sorteio ponderado. Determinístico por design: a MESMA string
 * (aqui, o id do lançamento) sempre cai no mesmo número, então a sugestão
 * não muda a cada reload da tela. */
function hashDeterministico01(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0;
  return (h >>> 0) / 4294967296;
}

/** Sorteio ponderado entre os candidatos empatados de um grupo — cada
 * candidato tem probabilidade proporcional aos seus votos históricos (não
 * uniforme). `semente` vem de hashDeterministico01(item.id), garantindo
 * resultado estável pro MESMO lançamento entre reloads. */
function sortearEntreEmpatados(votos: Map<string, number>, total: number, semente: number): [string, number] {
  const ordenado = [...votos.entries()].sort((a, b) => b[1] - a[1]);
  let acumulado = 0;
  for (const [composto, n] of ordenado) {
    acumulado += n / total;
    if (semente < acumulado) return [composto, n];
  }
  return ordenado[ordenado.length - 1]; // proteção contra erro de arredondamento de ponto flutuante
}

/** Chave fina — descrição+fornecedor (chaveAgrupamento) + valor exato. Ver
 * comentário do topo do arquivo pra por que o valor entra aqui. */
function chaveComValor(descricao: string, fornecedor: string | null | undefined, valor: number): string {
  return `${chaveAgrupamento(descricao, fornecedor)}|${valor.toFixed(2)}`;
}

async function construirIndice(tenantId: string): Promise<Map<string, Map<string, number>>> {
  const historico = await prisma.financeLancamento.findMany({
    where: { tenantId, centroCustoTipo: { not: "ADMINISTRACAO" } },
    select: { descricao: true, fornecedor: true, valor: true, centroCustoTipo: true, propertyId: true, uhId: true },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORICO,
  });

  // chave (grupo de descrição+valor) -> votos por combinação "centroCustoTipo|propertyId|uhId"
  const porGrupo = new Map<string, Map<string, number>>();
  for (const h of historico) {
    const chave = chaveComValor(h.descricao, h.fornecedor, Number(h.valor));
    const composto = `${h.centroCustoTipo}|${h.propertyId ?? ""}|${h.uhId ?? ""}`;
    let votos = porGrupo.get(chave);
    if (!votos) {
      votos = new Map();
      porGrupo.set(chave, votos);
    }
    votos.set(composto, (votos.get(composto) ?? 0) + 1);
  }
  return porGrupo;
}

/** Versão em lote (mesmo padrão de sugerirCategoriasEmLote/
 * sugerirRecorrenciaEmLote): constrói o índice do histórico UMA vez só e
 * sugere pra vários lançamentos de uma vez. Só entra no Map resultado quem
 * teve pelo menos um grupo conhecido — com maioria clara (>= MIN_CONFIANCA)
 * ou, na falta dela, por sorteio ponderado entre os empatados (ver
 * sortearEntreEmpatados). */
export async function sugerirCentroCustoEmLote(
  tenantId: string,
  itens: { id: string; descricao: string; fornecedor?: string | null; valor: number }[]
): Promise<Map<string, SugestaoCentroCusto>> {
  const resultado = new Map<string, SugestaoCentroCusto>();
  if (itens.length === 0) return resultado;

  const indice = await construirIndice(tenantId);

  for (const item of itens) {
    const chave = chaveComValor(item.descricao, item.fornecedor, item.valor);
    const votos = indice.get(chave);
    if (!votos || votos.size === 0) continue;

    const total = [...votos.values()].reduce((a, b) => a + b, 0);
    const ordenado = [...votos.entries()].sort((a, b) => b[1] - a[1]);
    const [composto, vencedores] = ordenado[0];
    const confiancaMaioria = Math.round((vencedores / total) * 100);

    let composto2: string;
    let n: number;
    let origem: "maioria" | "sorteio";
    if (confiancaMaioria >= MIN_CONFIANCA) {
      [composto2, n] = [composto, vencedores];
      origem = "maioria";
    } else {
      const semente = hashDeterministico01(item.id);
      [composto2, n] = sortearEntreEmpatados(votos, total, semente);
      origem = "sorteio";
    }

    const [centroCustoTipo, propertyId, uhId] = composto2.split("|");
    if (centroCustoTipo !== "EMPREENDIMENTO" && centroCustoTipo !== "UNIDADE") continue;

    resultado.set(item.id, { centroCustoTipo, propertyId: propertyId || null, uhId: uhId || null, confianca: Math.round((n / total) * 100), origem });
  }

  return resultado;
}
