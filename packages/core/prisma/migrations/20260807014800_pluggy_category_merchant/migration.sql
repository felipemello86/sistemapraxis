-- Pedido do Felipe, 06/08/2026: "capture também [category/merchant] e
-- também use como sugestão adicional [mesmo espírito do MCC]" — a Pluggy
-- também manda `category` (nível da transação) e `merchant.category`
-- (nível do estabelecimento), confirmados ao vivo contra a conta real do
-- tenant. `merchant.name` já é capturado em `fornecedor`, não duplicado.
ALTER TABLE "FinanceLancamento" ADD COLUMN "pluggyCategoria" TEXT;
ALTER TABLE "FinanceLancamento" ADD COLUMN "pluggyMerchantCategoria" TEXT;
