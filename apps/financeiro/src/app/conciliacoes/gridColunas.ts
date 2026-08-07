// Template de grid compartilhado entre o cabeçalho ordenável (ConciliacoesView)
// e cada card (ConciliacaoCardCompacto), pra garantir que as colunas fiquem
// alinhadas. Pedido do Felipe, 06/08/2026: "reorganize como colunas
// organizáveis: Lançamento / Vencimento / Conta / Descrição / Valor" — a 6ª
// posição (20px) é o botão de expandir, que não tem cabeçalho de texto.
export const GRID_COLUNAS = "grid-cols-[56px_56px_96px_minmax(0,1fr)_88px_20px]";
