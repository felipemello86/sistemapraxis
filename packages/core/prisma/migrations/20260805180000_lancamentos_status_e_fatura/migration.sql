-- Status "Quitado"/"Vencido"/"A Vencer" + fatura de cartão (pedido do
-- Felipe, 05/08/2026). Todas as colunas novas são opcionais ou têm
-- default, então esta migration é 100% aditiva/segura — sem precisar de
-- script de backfill como a dos blocos.

-- AlterTable
ALTER TABLE "FinanceContaBancaria" ADD COLUMN "diaVencimentoFatura" INTEGER;

-- AlterTable
ALTER TABLE "FinanceLancamento" ADD COLUMN "dataCompetencia" TEXT;
ALTER TABLE "FinanceLancamento" ADD COLUMN "pago" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FinanceLancamento" ADD COLUMN "pagoReferenciaLancamentoId" TEXT;
