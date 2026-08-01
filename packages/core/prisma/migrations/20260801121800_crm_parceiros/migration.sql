-- CreateTable
CREATE TABLE "CrmParceiro" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmParceiro_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "DemoLead" ADD COLUMN     "parceiroId" TEXT;

-- CreateIndex
CREATE INDEX "CrmParceiro_nome_idx" ON "CrmParceiro"("nome");

-- CreateIndex
CREATE INDEX "DemoLead_parceiroId_idx" ON "DemoLead"("parceiroId");

-- AddForeignKey
ALTER TABLE "DemoLead" ADD CONSTRAINT "DemoLead_parceiroId_fkey" FOREIGN KEY ("parceiroId") REFERENCES "CrmParceiro"("id") ON DELETE SET NULL ON UPDATE CASCADE;
