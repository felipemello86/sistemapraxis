-- Financeiro passa a usar Property/UH reais (Gateway) em vez do cadastro
-- próprio FinanceEmpreendimento/FinanceUnidade (pedido do Felipe,
-- 06/08/2026 — evita duplicar o mesmo prédio/UH em dois lugares com nomes
-- diferentes). Etapa 1/2: campos novos aditivos + FKs novas em
-- FinanceLancamento, convivendo com empreendimentoId/unidadeId por
-- enquanto (removidos na migration seguinte, depois da migração de dados).

-- AlterTable: Property ganha "ativo" (não existia soft-delete até aqui)
ALTER TABLE "Property" ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: UH ganha "desativadaEm" (mês de corte pro rateio financeiro
-- retroativo, mesma semântica que já existia em FinanceUnidade.desativadaEm)
ALTER TABLE "UH" ADD COLUMN "desativadaEm" TEXT;

-- AlterTable: FinanceLancamento ganha propertyId/uhId (substituem
-- empreendimentoId/unidadeId, removidos na próxima migration)
ALTER TABLE "FinanceLancamento" ADD COLUMN "propertyId" TEXT;
ALTER TABLE "FinanceLancamento" ADD COLUMN "uhId" TEXT;

-- CreateIndex
CREATE INDEX "FinanceLancamento_tenantId_propertyId_idx" ON "FinanceLancamento"("tenantId", "propertyId");

-- CreateIndex
CREATE INDEX "FinanceLancamento_tenantId_uhId_idx" ON "FinanceLancamento"("tenantId", "uhId");

-- AddForeignKey
ALTER TABLE "FinanceLancamento" ADD CONSTRAINT "FinanceLancamento_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLancamento" ADD CONSTRAINT "FinanceLancamento_uhId_fkey" FOREIGN KEY ("uhId") REFERENCES "UH"("id") ON DELETE SET NULL ON UPDATE CASCADE;
