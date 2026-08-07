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
// majoritário só aplica se ainda assim um imóvel dominar o histórico
// daquele valor específico; senão a confiança fica abaixo do limiar e a
// sugestão fica de fora (comportamento seguro de sempre).

import { prisma } from "../prisma";
import { chaveAgrupamento } from "./texto";

export interface SugestaoCentroCusto {
  centroCustoTipo: "EMPREENDIMENTO" | "UNIDADE";
  propertyId: string | null;
  uhId: string | null;
  confianca: number; // 0-100 = participação do vencedor entre os votos do grupo (100 = sempre o mesmo imóvel no histórico)
}

const MAX_HISTORICO = 5000;
// Mais conservador que o limiar de Categoria (55%, ver sugestao-categoria.ts)
// — aqui o grupo é EXATO (mesma descrição+fornecedor+valor, não parecido),
// então se ainda assim o histórico está dividido entre dois imóveis
// diferentes é sinal de ambiguidade real (o mesmo proprietário cobrando o
// mesmo valor de mais de um flat) — melhor não arriscar aplicar sozinho.
const MIN_CONFIANCA = 60;

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
 * teve um grupo conhecido E confiança >= MIN_CONFIANCA. */
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
    const [composto, vencedores] = [...votos.entries()].sort((a, b) => b[1] - a[1])[0];
    const confianca = Math.round((vencedores / total) * 100);
    if (confianca < MIN_CONFIANCA) continue;

    const [centroCustoTipo, propertyId, uhId] = composto.split("|");
    if (centroCustoTipo !== "EMPREENDIMENTO" && centroCustoTipo !== "UNIDADE") continue;

    resultado.set(item.id, { centroCustoTipo, propertyId: propertyId || null, uhId: uhId || null, confianca });
  }

  return resultado;
}
