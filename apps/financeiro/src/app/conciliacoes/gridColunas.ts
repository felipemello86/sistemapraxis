// Template de grid compartilhado entre o cabeçalho ordenável (ConciliacoesView)
// e cada card (ConciliacaoCardCompacto), pra garantir que as colunas fiquem
// alinhadas. Pedido do Felipe, 06/08/2026: "reorganize como colunas
// organizáveis: Lançamento / Vencimento / Conta / Descrição / Valor" +
// depois "colocar categoria e centro de custo como colunas também" — ordem
// final: Lanc. / Venc. / Conta / Descrição / Categoria / Centro de Custo /
// Valor / (botão de expandir, sem cabeçalho de texto).
export const GRID_COLUNAS = "grid-cols-[40px_40px_84px_minmax(0,1fr)_130px_120px_84px_20px]";
