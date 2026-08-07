-- CreateTable
CREATE TABLE "FinanceRegraRecorrencia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "recorrente" BOOLEAN NOT NULL,
    "frequencia" TEXT NOT NULL DEFAULT 'MENSAL',
    "origem" TEXT NOT NULL,
    "amostras" INTEGER NOT NULL DEFAULT 1,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceRegraRecorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceRegraRecorrencia_tenantId_chave_key" ON "FinanceRegraRecorrencia"("tenantId", "chave");

-- AddForeignKey
ALTER TABLE "FinanceRegraRecorrencia" ADD CONSTRAINT "FinanceRegraRecorrencia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
