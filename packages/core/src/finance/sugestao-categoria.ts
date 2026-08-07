// Sugestão automática de Categoria a partir do histórico já categorizado
// do tenant (pedido do Felipe, 06/08/2026: "quero que o sistema seja
// inteligente nessa categorização (...) o sistema tem que ir aprendendo o
// que cada descrição normalmente é em termos de categoria" — ex.: uma
// descrição com "supermercados" deve pré-preencher a categoria que o
// Felipe historicamente usou pra esse tipo de lançamento, sem precisar de
// regra cadastrada à mão).
//
// Abordagem: "vizinho mais próximo" (1-NN/k-NN) por similaridade de
// cosseno entre vetores de palavras ponderados por idf — pra um texto
// novo, acha as descrições HISTÓRICAS mais parecidas e copia a categoria
// que o Felipe já usou pra elas. Ponderar por idf faz palavras raras (nome
// do comerciante) pesarem muito mais que palavras comuns (cidade onde o
// tenant opera, por exemplo "Recife", que aparece em quase toda descrição
// e sozinha não distingue nada).
//
// Foi tentada antes uma versão mais simples (somar peso de cada palavra em
// comum por categoria, sem normalizar pelo tamanho do vetor) — na prática,
// com dado real do tenant, ela deixava uma categoria com MUITAS descrições
// distintas que só compartilhavam uma palavra genérica (ex.: "recife")
// vencer uma categoria com só uma descrição mas que batia EXATAMENTE
// (mesmas 3 palavras). A normalização por cosseno resolve isso: o placar
// não é mais "soma bruta de pontos entre todos os históricos parecidos",
// e sim "o quão parecido é o histórico mais parecido, individualmente".

import { prisma } from "../prisma";
import { normalizarTexto, tokensSignificativos } from "./texto";

export interface SugestaoCategoria {
  categoriaId: string;
  confianca: number; // 0-100, heurística (não é probabilidade estatística) — só pra decidir se vale pré-preencher
}

interface GrupoHistorico {
  tokens: string[];
  categoriaId: string;
  norma: number; // sqrt(soma dos idf^2 dos tokens) — pra normalizar o cosseno
}

interface IndiceCategorias {
  grupos: GrupoHistorico[];
  idf: Map<string, number>;
}

const MAX_HISTORICO = 5000; // suficiente pra aprender padrões sem carregar o histórico inteiro do tenant
const MIN_COSSENO = 0.2; // abaixo disso o "vizinho mais próximo" é parecido demais por acaso (só palavra genérica em comum) pra confiar

// MCC (Merchant Category Code, ver mcc.ts) entra no mesmo espaço vetorial
// de tokens de texto como um "pseudo-token" (ex.: MCC 5411 vira "mcc5411")
// — pedido do Felipe, 06/08/2026: "tem algum campo q vem da pluggy q fale
// da natureza do estabelecimento comercial q fez a venda?", capturado
// justamente pra reforçar a sugestão de categoria quando o NOME do
// estabelecimento é novo/nunca visto mas a NATUREZA dele (mesmo MCC) já é
// conhecida do histórico — ex.: um restaurante novo que o Felipe nunca
// comprou antes, mas com o mesmo MCC 5812 de outros restaurantes já
// categorizados como "Lanches e Refeições". Prefixo "mcc" (letras) evita
// colisão com token puramente numérico que porventura apareça no texto de
// uma descrição real (tokensSignificativos mantém dígitos).
function tokenMcc(mcc: number): string {
  return `mcc${mcc}`;
}

// Mesmo espírito do MCC (pedido do Felipe, 06/08/2026: "capture também
// [category/merchant] e também use como sugestão adicional [mesmo espírito
// do MCC]") — a PRÓPRIA Pluggy manda uma categorização automática dela, em
// dois níveis: da transação (`category`, ex. "Groceries") e do
// estabelecimento (`merchant.category`, ex. "Video Streaming"). Cada uma
// vira seu próprio pseudo-token, com prefixo distinto (pcat_/mcat_) pra não
// colidir entre si nem com o MCC — são sinais de natureza PARECIDA mas
// vindos de fontes diferentes (Enrichment Categorizer da Pluggy vs. MCC
// padrão Visa/Mastercard), então tratados como tokens independentes.
function tokenPluggyCategoria(cat: string): string {
  return `pcat_${normalizarTexto(cat).replace(/[^a-z0-9]/g, "")}`;
}
function tokenMerchantCategoria(cat: string): string {
  return `mcat_${normalizarTexto(cat).replace(/[^a-z0-9]/g, "")}`;
}

async function construirIndice(tenantId: string): Promise<IndiceCategorias> {
  const historico = await prisma.financeLancamento.findMany({
    where: { tenantId, categoriaId: { not: null } },
    select: { descricao: true, fornecedor: true, categoriaId: true, pluggyPayeeMcc: true, pluggyCategoria: true, pluggyMerchantCategoria: true },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORICO,
  });

  // Deduplica por texto normalizado ANTES de indexar (achado testando com
  // dado real do tenant, 06/08/2026): uma cobrança recorrente idêntica
  // repetida dezenas de vezes (ex.: mensalidade de lavanderia, sempre com a
  // mesma descrição exata) não pode valer dezenas de exemplos de treino —
  // cada descrição DISTINTA vira 1 exemplo só, usando a categoria mais
  // votada entre as ocorrências dela (e o MCC/category/merchant.category
  // mais votados, quando presentes).
  const porDescricao = new Map<
    string,
    {
      descricao: string;
      fornecedor: string | null;
      votos: Map<string, number>;
      mccVotos: Map<number, number>;
      pluggyCatVotos: Map<string, number>;
      merchantCatVotos: Map<string, number>;
    }
  >();
  for (const h of historico) {
    if (!h.categoriaId) continue;
    // normalizarTexto (não trim()+toLowerCase() puro) é essencial aqui: os
    // extratos importados vêm com espaçamento interno inconsistente entre
    // ocorrências da MESMA descrição (largura fixa de statement bancário).
    const chave = `${normalizarTexto(h.descricao)}|${normalizarTexto(h.fornecedor)}`;
    let grupo = porDescricao.get(chave);
    if (!grupo) {
      grupo = { descricao: h.descricao, fornecedor: h.fornecedor, votos: new Map(), mccVotos: new Map(), pluggyCatVotos: new Map(), merchantCatVotos: new Map() };
      porDescricao.set(chave, grupo);
    }
    grupo.votos.set(h.categoriaId, (grupo.votos.get(h.categoriaId) ?? 0) + 1);
    if (h.pluggyPayeeMcc != null) grupo.mccVotos.set(h.pluggyPayeeMcc, (grupo.mccVotos.get(h.pluggyPayeeMcc) ?? 0) + 1);
    if (h.pluggyCategoria) grupo.pluggyCatVotos.set(h.pluggyCategoria, (grupo.pluggyCatVotos.get(h.pluggyCategoria) ?? 0) + 1);
    if (h.pluggyMerchantCategoria) grupo.merchantCatVotos.set(h.pluggyMerchantCategoria, (grupo.merchantCatVotos.get(h.pluggyMerchantCategoria) ?? 0) + 1);
  }

  function maisVotado<T>(votos: Map<T, number>): T | null {
    return votos.size > 0 ? [...votos.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
  }

  const exemplos = [...porDescricao.values()].map((grupo) => {
    const categoriaMaisVotada = maisVotado(grupo.votos)!;
    const mccMaisVotado = maisVotado(grupo.mccVotos);
    const pluggyCatMaisVotada = maisVotado(grupo.pluggyCatVotos);
    const merchantCatMaisVotada = maisVotado(grupo.merchantCatVotos);
    const tokens = tokensSignificativos(`${grupo.descricao} ${grupo.fornecedor ?? ""}`);
    if (mccMaisVotado != null) tokens.push(tokenMcc(mccMaisVotado));
    if (pluggyCatMaisVotada) tokens.push(tokenPluggyCategoria(pluggyCatMaisVotada));
    if (merchantCatMaisVotada) tokens.push(tokenMerchantCategoria(merchantCatMaisVotada));
    return { tokens: [...new Set(tokens)], categoriaId: categoriaMaisVotada };
  });

  // document frequency: em quantas descrições DISTINTAS do histórico cada
  // palavra aparece — quanto mais espalhada entre comerciantes diferentes,
  // menos ela ajuda a distinguir categoria (ex.: nome da cidade onde o
  // tenant opera, presente em quase toda descrição).
  const df = new Map<string, number>();
  for (const ex of exemplos) for (const t of ex.tokens) df.set(t, (df.get(t) ?? 0) + 1);

  const n = exemplos.length || 1;
  const idf = new Map<string, number>();
  for (const t of df.keys()) idf.set(t, Math.log(1 + n / (df.get(t) ?? 1)));

  const grupos: GrupoHistorico[] = exemplos.map((ex) => ({
    tokens: ex.tokens,
    categoriaId: ex.categoriaId,
    norma: Math.sqrt(ex.tokens.reduce((soma, t) => soma + (idf.get(t) ?? 0) ** 2, 0)),
  }));

  return { grupos, idf };
}

/** Acha, no histórico, as descrições mais parecidas com `tokensQuery`
 * (similaridade de cosseno num espaço vetorial ponderado por idf) e
 * escolhe a categoria por votação ponderada entre os melhores vizinhos —
 * pondera tanto "o quão parecido foi o melhor vizinho" (cosseno absoluto)
 * quanto "o quão os vizinhos concordaram entre si" (participação da
 * categoria vencedora na soma total). */
function sugerirPorVizinhoMaisProximo(indice: IndiceCategorias, tokensQuery: string[]): SugestaoCategoria | null {
  if (tokensQuery.length === 0 || indice.grupos.length === 0) return null;

  const querySet = new Set(tokensQuery);
  const normaQuery = Math.sqrt(tokensQuery.reduce((soma, t) => soma + (indice.idf.get(t) ?? 0) ** 2, 0));
  if (normaQuery === 0) return null;

  let melhorCosseno = 0;
  const pontosPorCategoria = new Map<string, number>();

  for (const grupo of indice.grupos) {
    if (grupo.norma === 0) continue;
    let produtoInterno = 0;
    for (const t of grupo.tokens) {
      if (querySet.has(t)) produtoInterno += (indice.idf.get(t) ?? 0) ** 2;
    }
    if (produtoInterno === 0) continue;
    const cosseno = produtoInterno / (normaQuery * grupo.norma);
    if (cosseno > melhorCosseno) melhorCosseno = cosseno;
    pontosPorCategoria.set(grupo.categoriaId, (pontosPorCategoria.get(grupo.categoriaId) ?? 0) + cosseno);
  }

  if (melhorCosseno < MIN_COSSENO || pontosPorCategoria.size === 0) return null;

  const ordenado = [...pontosPorCategoria.entries()].sort((a, b) => b[1] - a[1]);
  const [categoriaId, pontosCategoria] = ordenado[0];
  const totalPontos = [...pontosPorCategoria.values()].reduce((a, b) => a + b, 0);
  const participacao = totalPontos > 0 ? pontosCategoria / totalPontos : 0;

  // confiança combina "quão parecido é o melhor vizinho, sozinho" (peso 70)
  // com "quão os vizinhos concordaram entre si nessa categoria" (peso 30).
  const confianca = Math.round(Math.min(100, melhorCosseno * 70 + participacao * 30));

  return { categoriaId, confianca };
}

function tokensDeConsulta(descricao: string, fornecedor?: string | null, payeeMcc?: number | null, pluggyCategoria?: string | null, pluggyMerchantCategoria?: string | null): string[] {
  const tokens = tokensSignificativos(`${descricao} ${fornecedor ?? ""}`);
  if (payeeMcc != null) tokens.push(tokenMcc(payeeMcc));
  if (pluggyCategoria) tokens.push(tokenPluggyCategoria(pluggyCategoria));
  if (pluggyMerchantCategoria) tokens.push(tokenMerchantCategoria(pluggyMerchantCategoria));
  return tokens;
}

/** Sugere uma categoria pra UM texto novo (descrição + fornecedor +
 * opcionalmente MCC/category/merchant.category do estabelecimento, ver
 * tokenMcc/tokenPluggyCategoria/tokenMerchantCategoria acima), a partir do
 * histórico já categorizado do tenant. Retorna null se não há nenhuma
 * descrição parecida o bastante no histórico (nada a aprender ainda, ou
 * parecido demais só por acaso). */
export async function sugerirCategoriaPorTexto(
  tenantId: string,
  descricao: string,
  fornecedor?: string | null,
  payeeMcc?: number | null,
  pluggyCategoria?: string | null,
  pluggyMerchantCategoria?: string | null
): Promise<SugestaoCategoria | null> {
  const indice = await construirIndice(tenantId);
  return sugerirPorVizinhoMaisProximo(indice, tokensDeConsulta(descricao, fornecedor, payeeMcc, pluggyCategoria, pluggyMerchantCategoria));
}

/** Versão em lote — constrói o índice do histórico UMA vez só e sugere pra
 * vários lançamentos de uma vez (usada por listarPendentesDeConciliacao,
 * que já lista até 500 pendentes numa chamada só; chamar
 * sugerirCategoriaPorTexto pra cada um refaria a query do histórico 500
 * vezes). Retorna um Map id -> sugestão (só entra na Map quem teve
 * sugestão, ou seja, teve uma descrição parecida o bastante no histórico). */
export async function sugerirCategoriasEmLote(
  tenantId: string,
  itens: { id: string; descricao: string; fornecedor?: string | null; payeeMcc?: number | null; pluggyCategoria?: string | null; pluggyMerchantCategoria?: string | null }[]
): Promise<Map<string, SugestaoCategoria>> {
  const resultado = new Map<string, SugestaoCategoria>();
  if (itens.length === 0) return resultado;
  const indice = await construirIndice(tenantId);
  for (const item of itens) {
    const sugestao = sugerirPorVizinhoMaisProximo(
      indice,
      tokensDeConsulta(item.descricao, item.fornecedor, item.payeeMcc, item.pluggyCategoria, item.pluggyMerchantCategoria)
    );
    if (sugestao) resultado.set(item.id, sugestao);
  }
  return resultado;
}
