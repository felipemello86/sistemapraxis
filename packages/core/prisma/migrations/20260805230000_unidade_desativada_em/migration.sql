-- Mês/ano a partir do qual uma Unidade desativada some do rateio (pedido
-- do Felipe, 05/08/2026, 2ª rodada) — ver comentário no schema.prisma.
ALTER TABLE "FinanceUnidade" ADD COLUMN "desativadaEm" TEXT;
