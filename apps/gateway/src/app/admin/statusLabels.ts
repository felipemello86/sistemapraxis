// Labels/cores de status de assinatura (Stripe) — compartilhado entre a
// lista de clientes (/admin/clientes) e a tela de pagamentos de um cliente
// específico (/admin/clientes/[tenantId]), pra não duplicar o mesmo mapa em
// dois lugares (30/07/2026, extraído durante a reorganização do painel em
// tiles — Vendas/Clientes/Planos).
export const STATUS_LABEL: Record<string, string> = {
  SEM_ASSINATURA: "Sem assinatura",
  INCOMPLETA: "Checkout pendente",
  ATIVA: "Ativa",
  INADIMPLENTE: "Inadimplente",
  CANCELADA: "Cancelada",
};

export const STATUS_COLOR: Record<string, string> = {
  SEM_ASSINATURA: "#6e6e73",
  INCOMPLETA: "#ff9500",
  ATIVA: "#34c759",
  INADIMPLENTE: "#d70015",
  CANCELADA: "#8e8e93",
};
