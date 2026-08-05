// Status de um lançamento (requisito do Felipe, 05/08/2026): Vencido, A
// Vencer ou Quitado. Regra de derivação, decidida junto com ele:
//   - lançamento de conta corrente (FinanceContaBancaria.tipo=BANK) é
//     SEMPRE quitado — o dinheiro já saiu de fato, `pago` é ignorado.
//   - lançamento de cartão de crédito (tipo=CREDIT) ou sem conta vinculada
//     (lançamento manual "solto") depende do campo `pago`: quitado se
//     pago=true, senão Vencido/A Vencer conforme a Data de Vencimento
//     comparada a hoje.
//
// `pago` em cartão vira true automaticamente quando o sistema detecta o
// pagamento da fatura na conta corrente (ver detectarPagamentosDeFatura em
// pluggy.ts) — mas pode ser corrigido na mão se a detecção errar.

export type StatusLancamento = "QUITADO" | "VENCIDO" | "A_VENCER";

export const STATUS_LABELS: Record<StatusLancamento, string> = {
  QUITADO: "Quitado",
  VENCIDO: "Vencido",
  A_VENCER: "A Vencer",
};

export function calcularStatusLancamento(params: { contaTipo: string | null | undefined; pago: boolean; dataVencimento: string; hoje: string }): StatusLancamento {
  if (params.contaTipo === "BANK") return "QUITADO";
  if (params.pago) return "QUITADO";
  return params.dataVencimento < params.hoje ? "VENCIDO" : "A_VENCER";
}
