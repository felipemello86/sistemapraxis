-- CreateTable
CREATE TABLE "DailyClosure" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "finalizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoPorNome" TEXT NOT NULL,

    CONSTRAINT "DailyClosure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyClosure_tenantId_data_key" ON "DailyClosure"("tenantId", "data");
