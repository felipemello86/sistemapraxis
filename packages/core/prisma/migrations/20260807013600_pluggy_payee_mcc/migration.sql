-- Pedido do Felipe, 06/08/2026: "tem algum campo q vem da pluggy q fale da
-- natureza do estabelecimento comercial q fez a venda?" — sim,
-- creditCardMetadata.payeeMCC (MCC padrão Visa/Mastercard, confirmado ao
-- vivo contra a conta real do tenant). Puramente informativo + sinal extra
-- na sugestão automática de categoria (ver sugestao-categoria.ts).
ALTER TABLE "FinanceLancamento" ADD COLUMN "pluggyPayeeMcc" INTEGER;
