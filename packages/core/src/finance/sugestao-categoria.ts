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

async function construirIndice(tenantId: string): Promise<IndiceCategorias> {
  const historico = await prisma.financeLancamento.findMany({
    where: { tenantId, categoriaId: { not: null } },
    select: { descricao: true, fornecedor: true, categoriaId: true },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORICO,
  });

  // Deduplica por texto normalizado ANTES de indexar (achado testando com
  // dado real do tenant, 06/08/2026): uma cobrança recorrente idêntica
  // repetida dezenas de vezes (ex.: mensalidade de lavanderia, sempre com a
  // mesma descrição exata) não pode valer dezenas de exemplos de treino —
  // cada descrição DISTINTA vira 1 exemplo só, usando a categoria mais
  // votada entre as ocorrências dela.
  const porDescricao = new Map<string, { descricao: string; fornecedor: string | null; votos: Map<string, number> }>();
  for (const h of historico) {
    if (!h.categoriaId) continue;
    // normalizarTexto (não trim()+toLowerCase() puro) é essencial aqui: os
    // extratos importados vêm com espaçamento interno inconsistente entre
    // ocorrências da MESMA descrição (largura fixa de statement bancário).
    const chave = `${normalizarTexto(h.descricao)}|${normalizarTexto(h.fornecedor)}`;
    let grupo = porDescricao.get(chave);
    if (!grupo) {
      grupo = { descricao: h.descricao, fornecedor: h.fornecedor, votos: new Map() };
      porDescricao.set(chave, grupo);
    }
    grupo.votos.set(h.categoriaId, (grupo.votos.get(h.categoriaId) ?? 0) + 1);
  }

  const exemplos = [...porDescricao.values()].map((grupo) => {
    const categoriaMaisVotada = [...grupo.votos.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return { tokens: [...new Set(tokensSignificativos(`${grupo.descricao} ${grupo.fornecedor ?? ""}`))], categoriaId: categoriaMaisVotada };
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

/** Sugere uma categoria pra UM texto novo (descrição + fornecedor), a
 * partir do histórico já categorizado do tenant. Retorna null se não há
 * nenhuma descrição parecida o bastante no histórico (nada a aprender
 * ainda, ou parecido demais só por acaso). */
export async function sugerirCategoriaPorTexto(tenantId: string, descricao: string, fornecedor?: string | null): Promise<SugestaoCategoria | null> {
  const indice = await construirIndice(tenantId);
  return sugerirPorVizinhoMaisProximo(indice, tokensSignificativos(`${descricao} ${fornecedor ?? ""}`));
}

/** Versão em lote — constrói o índice do histórico UMA vez só e sugere pra
 * vários lançamentos de uma vez (usada por listarPendentesDeConciliacao,
 * que já lista até 500 pendentes numa chamada só; chamar
 * sugerirCategoriaPorTexto pra cada um refaria a query do histórico 500
 * vezes). Retorna um Map id -> sugestão (só entra na Map quem teve
 * sugestão, ou seja, teve uma descrição parecida o bastante no histórico). */
export async function sugerirCategoriasEmLote(
  tenantId: string,
  itens: { id: string; descricao: string; fornecedor?: string | null }[]
): Promise<Map<string, SugestaoCategoria>> {
  const resultado = new Map<string, SugestaoCategoria>();
  if (itens.length === 0) return resultado;
  const indice = await construirIndice(tenantId);
  for (const item of itens) {
    const sugestao = sugerirPorVizinhoMaisProximo(indice, tokensSignificativos(`${item.descricao} ${item.fornecedor ?? ""}`));
    if (sugestao) resultado.set(item.id, sugestao);
  }
  return resultado;
}
