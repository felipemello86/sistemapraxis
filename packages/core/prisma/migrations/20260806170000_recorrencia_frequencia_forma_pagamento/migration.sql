-- Popup "Repetir Lançamento" da nova tela de Conciliações (pedido do
-- Felipe, 06/08/2026, espelhando o Conta Azul): recorrência ganha
-- frequência (mensal/anual, antes só existia mensal implícito) e o
-- lançamento ganha um campo informativo de forma de pagamento.

ALTER TABLE "FinanceLancamento" ADD COLUMN "recorrenciaFrequencia" TEXT NOT NULL DEFAULT 'MENSAL';
ALTER TABLE "FinanceLancamento" ADD COLUMN "formaPagamento" TEXT;
