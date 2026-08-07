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
//
// REGRA adicional (pedido do Felipe, 06/08/2026: "a 'regra' é q um mesmo
// imóvel n deve ter dois pagamentos no mesmo mês") — um flat só recebe UM
// aluguel por mês; se dois lançamentos ambíguos do mesmo mês (ex.: duas
// transferências de Fabio Nunes Ferreira de R$2.300 em agosto) sorteassem
// o MESMO imóvel, um dos dois estaria necessariamente errado. Por isso o
// lote inteiro é processado numa ordem fixa (por id, não pela ordem de
// chegada) reservando o imóvel escolhido pro mês daquele lançamento — o
// próximo lançamento ambíguo do MESMO mês já exclui esse imóvel dos
// candidatos (tanto na maioria quanto no sorteio). A reserva também
// considera o que já está GRAVADO de verdade no banco (outro lançamento já
// conciliado pra aquele imóvel naquele mês), não só o que está sendo
// sugerido agora. Se todos os candidatos de um lançamento já estiverem
// reservados naquele mês, fica sem sugestão (não força um imóvel errado).

import { prisma } from "../prisma";
import { chaveAgrupamento } from "./texto";

export interface SugestaoCentroCusto {
  centroCustoTipo: "EMPREENDIMENTO" | "UNIDADE";
  propertyId: string | null;
  uhId: string | null;
  confianca: number; // 0-100 = participação do escolhido entre os votos disponíveis do grupo (100 = sempre o mesmo imóvel no histórico, ou só sobrou 1 candidato depois de excluir os já usados no mês)
  origem: "maioria" | "sorteio"; // "sorteio" = empate real, escolhido por sorteio ponderado (ver comentário do topo)
}

const MAX_HISTORICO = 5000;
// Mais conservador que o limiar de Categoria (55%, ver sugestao-categoria.ts)
// — aqui o grupo é EXATO (mesma descrição+fornecedor+valor, não parecido),
// então se ainda assim o histórico está dividido entre dois imóveis
// diferentes é sinal de ambiguidade real (o mesmo proprietário cobrando o
// mesmo valor de mais de um flat). Acima do limiar, aplica direto (origem
// "maioria"); abaixo, sorteia entre os candidatos (origem "sorteio", ver
// escolherCandidato) em vez de deixar sem sugestão nenhuma.
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

/** Chave fina — descrição+fornecedor (chaveAgrupamento) + valor exato. Ver
 * comentário do topo do arquivo pra por que o valor entra aqui. */
function chaveComValor(descricao: string, fornecedor: string | null | undefined, valor: number): string {
  return `${chaveAgrupamento(descricao, fornecedor)}|${valor.toFixed(2)}`;
}

function uhDoComposto(composto: string): string | null {
  const uhId = composto.split("|")[2];
  return uhId || null;
}

/** Escolhe um candidato dentro de `votos`, EXCLUINDO qualquer UH que já
 * esteja em `usadosNoMes` (regra "um imóvel não recebe 2 pagamentos no
 * mesmo mês", ver comentário do topo). Maioria clara (>= MIN_CONFIANCA)
 * entre os candidatos restantes aplica direto; senão sorteia ponderado
 * pelos votos restantes. `null` quando não sobra nenhum candidato
 * disponível (todos já reservados esse mês). */
function escolherCandidato(votos: Map<string, number>, usadosNoMes: Set<string>, semente: number): { composto: string; confianca: number; origem: "maioria" | "sorteio" } | null {
  const disponiveis = [...votos.entries()].filter(([composto]) => {
    const uhId = uhDoComposto(composto);
    return !uhId || !usadosNoMes.has(uhId);
  });
  if (disponiveis.length === 0) return null;

  const total = disponiveis.reduce((soma, [, n]) => soma + n, 0);
  const ordenado = disponiveis.sort((a, b) => b[1] - a[1]);
  const [composto, vencedores] = ordenado[0];
  const confiancaMaioria = Math.round((vencedores / total) * 100);
  if (confiancaMaioria >= MIN_CONFIANCA) {
    return { composto, confianca: confiancaMaioria, origem: "maioria" };
  }

  let acumulado = 0;
  for (const [composto2, n] of ordenado) {
    acumulado += n / total;
    if (semente < acumulado) return { composto: composto2, confianca: Math.round((n / total) * 100), origem: "sorteio" };
  }
  const [ultimoComposto, ultimoN] = ordenado[ordenado.length - 1]; // proteção contra erro de arredondamento de ponto flutuante
  return { composto: ultimoComposto, confianca: Math.round((ultimoN / total) * 100), origem: "sorteio" };
}

async function construirIndice(tenantId: string): Promise<{ porGrupo: Map<string, Map<string, number>>; usadoNoMesGravado: Map<string, Set<string>> }> {
  const historico = await prisma.financeLancamento.findMany({
    where: { tenantId, centroCustoTipo: { not: "ADMINISTRACAO" } },
    select: { descricao: true, fornecedor: true, valor: true, centroCustoTipo: true, propertyId: true, uhId: true, dataVencimento: true, dataCompetencia: true },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORICO,
  });

  // chave (grupo de descrição+valor) -> votos por combinação "centroCustoTipo|propertyId|uhId"
  const porGrupo = new Map<string, Map<string, number>>();
  // mês (YYYY-MM) -> UHs que JÁ têm um lançamento gravado nesse mês — usado
  // pra nunca sugerir o mesmo imóvel 2x no mesmo mês (ver comentário do topo).
  const usadoNoMesGravado = new Map<string, Set<string>>();

  for (const h of historico) {
    const chave = chaveComValor(h.descricao, h.fornecedor, Number(h.valor));
    const composto = `${h.centroCustoTipo}|${h.propertyId ?? ""}|${h.uhId ?? ""}`;
    let votos = porGrupo.get(chave);
    if (!votos) {
      votos = new Map();
      porGrupo.set(chave, votos);
    }
    votos.set(composto, (votos.get(composto) ?? 0) + 1);

    if (h.centroCustoTipo === "UNIDADE" && h.uhId) {
      const mes = (h.dataCompetencia || h.dataVencimento).slice(0, 7);
      if (!usadoNoMesGravado.has(mes)) usadoNoMesGravado.set(mes, new Set());
      usadoNoMesGravado.get(mes)!.add(h.uhId);
    }
  }

  return { porGrupo, usadoNoMesGravado };
}

/** Versão em lote (mesmo padrão de sugerirCategoriasEmLote/
 * sugerirRecorrenciaEmLote): constrói o índice do histórico UMA vez só e
 * sugere pra vários lançamentos de uma vez. Processa em ordem
 * DETERMINÍSTICA (por id, não pela ordem de chegada de `itens`) reservando
 * o imóvel escolhido pro mês daquele item, pra nunca sugerir o mesmo imóvel
 * 2x no mesmo mês dentro do lote — ver comentário do topo. Só entra no Map
 * resultado quem teve pelo menos um candidato AINDA DISPONÍVEL nesse mês. */
export async function sugerirCentroCustoEmLote(
  tenantId: string,
  itens: { id: string; descricao: string; fornecedor?: string | null; valor: number; mes: string }[]
): Promise<Map<string, SugestaoCentroCusto>> {
  const resultado = new Map<string, SugestaoCentroCusto>();
  if (itens.length === 0) return resultado;

  const { porGrupo, usadoNoMesGravado } = await construirIndice(tenantId);
  const usadoPorMes = new Map<string, Set<string>>();
  for (const [mes, set] of usadoNoMesGravado) usadoPorMes.set(mes, new Set(set));

  const ordenados = [...itens].sort((a, b) => a.id.localeCompare(b.id));

  for (const item of ordenados) {
    const chave = chaveComValor(item.descricao, item.fornecedor, item.valor);
    const votos = porGrupo.get(chave);
    if (!votos || votos.size === 0) continue;

    const usadosNoMes = usadoPorMes.get(item.mes) ?? new Set<string>();
    const semente = hashDeterministico01(item.id);
    const escolha = escolherCandidato(votos, usadosNoMes, semente);
    if (!escolha) continue; // todos os candidatos já reservados esse mês — sem sugestão, não arrisca

    const [centroCustoTipo, propertyId, uhId] = escolha.composto.split("|");
    if (centroCustoTipo !== "EMPREENDIMENTO" && centroCustoTipo !== "UNIDADE") continue;

    resultado.set(item.id, { centroCustoTipo, propertyId: propertyId || null, uhId: uhId || null, confianca: escolha.confianca, origem: escolha.origem });

    if (centroCustoTipo === "UNIDADE" && uhId) {
      if (!usadoPorMes.has(item.mes)) usadoPorMes.set(item.mes, new Set());
      usadoPorMes.get(item.mes)!.add(uhId);
    }
  }

  return resultado;
}
