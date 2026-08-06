-- Conciliação (pedido do Felipe, 05/08/2026): pareia um lançamento real
-- (importado do extrato) com o lançamento previsto (manual, recorrente ou
-- pontual) que ele cumpre. Ver comentário no schema.prisma.

-- AlterTable
ALTER TABLE "FinanceLancamento" ADD COLUMN "conciliadoComId" TEXT;
ALTER TABLE "FinanceLancamento" ADD COLUMN "conciliadoMesReferencia" TEXT;
ALTER TABLE "FinanceLancamento" ADD COLUMN "conciliadoDiverso" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "FinanceLancamento_tenantId_conciliadoComId_idx" ON "FinanceLancamento"("tenantId", "conciliadoComId");

-- CreateIndex
CREATE INDEX "FinanceLancamento_tenantId_conciliadoMesReferencia_idx" ON "FinanceLancamento"("tenantId", "conciliadoMesReferencia");

-- AddForeignKey
ALTER TABLE "FinanceLancamento" ADD CONSTRAINT "FinanceLancamento_conciliadoComId_fkey" FOREIGN KEY ("conciliadoComId") REFERENCES "FinanceLancamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
