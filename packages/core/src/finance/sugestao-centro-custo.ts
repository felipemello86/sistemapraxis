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
// descrição+fornecedor (ex.: "FABIO NUNES FERREIRA DEBITO TRANSF PIX",
// sempre o aluguel do MESMO flat) corresponde sempre ao MESMO imóvel/UH —
// então um voto majoritário EXATO por grupo (sem cosseno/idf) já é
// suficiente e, na prática, mais confiável (não arrisca "vazar" o centro de
// custo de um imóvel pro de outro só por parecença textual).

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
// — aqui o grupo é EXATO (mesma descrição+fornecedor, não parecido), então
// se ainda assim o histórico está dividido entre dois imóveis diferentes é
// sinal de ambiguidade real (ex.: descrição genérica reaproveitada por
// engano em mais de um flat) — melhor não arriscar aplicar sozinho.
const MIN_CONFIANCA = 60;

async function construirIndice(tenantId: string): Promise<Map<string, Map<string, number>>> {
  const historico = await prisma.financeLancamento.findMany({
    where: { tenantId, centroCustoTipo: { not: "ADMINISTRACAO" } },
    select: { descricao: true, fornecedor: true, centroCustoTipo: true, propertyId: true, uhId: true },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORICO,
  });

  // chave (grupo de descrição) -> votos por combinação "centroCustoTipo|propertyId|uhId"
  const porGrupo = new Map<string, Map<string, number>>();
  for (const h of historico) {
    const chave = chaveAgrupamento(h.descricao, h.fornecedor);
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
  itens: { id: string; descricao: string; fornecedor?: string | null }[]
): Promise<Map<string, SugestaoCentroCusto>> {
  const resultado = new Map<string, SugestaoCentroCusto>();
  if (itens.length === 0) return resultado;

  const indice = await construirIndice(tenantId);

  for (const item of itens) {
    const chave = chaveAgrupamento(item.descricao, item.fornecedor);
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
