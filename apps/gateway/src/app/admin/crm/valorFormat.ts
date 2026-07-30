// Formatação compartilhada do campo "Valor (R$)" (30/07/2026) — usado no
// card do Kanban, na soma por coluna e na tela de detalhe do lead, pra não
// duplicar a lógica de Intl.NumberFormat em cada lugar.

// Card individual / tela de detalhe: com centavos (ex: "R$ 1.250,00").
export function formatValorBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Cabeçalho da coluna (soma de vários leads): sem centavos, pra caber no
// espaço apertado ao lado do contador de cards (ex: "R$ 42.000").
export function formatValorBRLCompacto(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}
