// Normalização e tokenização de texto de lançamentos financeiros
// (descrição/fornecedor) — módulo compartilhado usado tanto pra achar
// candidatos a PREVISTO (conciliacao.ts, comparando o texto do lançamento
// real importado com o do previsto) quanto pra aprender/sugerir uma
// Categoria a partir do histórico já categorizado (sugestao-categoria.ts).
// Ficar num módulo só garante que as duas coisas usam exatamente a mesma
// noção de "palavra significativa" — pedido do Felipe, 06/08/2026: "o
// sistema tem que ir aprendendo o que cada descrição normalmente é em
// termos de categoria (...) o mesmo vale pra encontrar lançamentos
// previstos, usando valor e descrição".

// Ruído recorrente em descrições de cartão/pix/boleto importadas da Pluggy
// que não ajuda a identificar o ESTABELECIMENTO — e que antes (quando cada
// lugar tinha sua própria lista de tokens, sem stopwords) inflava
// indevidamente a semelhança entre lançamentos de comerciantes totalmente
// diferentes que só tinham a forma de pagamento em comum (ex.: "A vista sem
// juros - Visa - ..." em praticamente toda compra de cartão de crédito).
const STOPWORDS = new Set([
  "vista",
  "juros",
  "parcelado",
  "parcelas",
  "parcela",
  "cartao",
  "visa",
  "mastercard",
  "elo",
  "hipercard",
  "amex",
  "debito",
  "credito",
  "compra",
  "compras",
  "pagamento",
  "pagto",
  "transferencia",
  "transf",
  "boleto",
  "recebido",
  "fatura",
  "internacional",
  "nacional",
  "debitado",
  "lancamento",
  "referente",
  "estabelecimento",
  "brasil",
]);

export function normalizarTexto(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Palavras "significativas" de um texto — minúsculas, sem acento, sem
 * pontuação/números, com pelo menos 4 letras e fora da lista de ruído de
 * forma de pagamento (ver STOPWORDS acima). */
export function tokensSignificativos(s: string): string[] {
  return normalizarTexto(s)
    .replace(/\d+\s*\/\s*\d+/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

/** Chave de agrupamento "é a mesma cobrança" — descrição+fornecedor
 * normalizados (não tokensSignificativos: aqui queremos IGUALDADE exata do
 * texto normalizado, não similaridade). Usada por qualquer lugar que
 * precise agrupar ocorrências históricas da mesma cobrança recorrente pra
 * aprender um padrão (categoria, recorrência, centro de custo) — ficar
 * numa função só garante que todos enxergam "o mesmo grupo" da mesma forma. */
export function chaveAgrupamento(descricao: string, fornecedor?: string | null): string {
  return `${normalizarTexto(descricao)}|${normalizarTexto(fornecedor)}`;
}
