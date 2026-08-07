// Template de grid compartilhado entre o cabeçalho ordenável (ConciliacoesView)
// e cada card (ConciliacaoCardCompacto), pra garantir que as colunas fiquem
// alinhadas. Pedido do Felipe, 06/08/2026: "reorganize como colunas
// organizáveis: Lançamento / Vencimento / Conta / Descrição / Valor" +
// depois "colocar categoria e centro de custo como colunas também" — ordem
// final: Lanc. / Venc. / Conta / Descrição / Categoria / Centro de Custo /
// Recorrência / Valor / (botão de expandir, sem cabeçalho de texto). Valor
// alargado de 84px pra 108px (pedido do Felipe, 06/08/2026: "o valor -R$
// 2.300,00 ficou ocupando duas linhas") + whitespace-nowrap nas células, já
// que "-R$ X.XXX,XX" não cabia em 84px e quebrava linha. Recorrência
// (pedido do Felipe, 06/08/2026: "adicione uma coluna de Recorrência (...)
// basta um símbolo em cada linha") é só um ícone clicável, 28px bastam.
export const GRID_COLUNAS = "grid-cols-[40px_40px_84px_minmax(0,1fr)_130px_120px_28px_108px_20px]";
