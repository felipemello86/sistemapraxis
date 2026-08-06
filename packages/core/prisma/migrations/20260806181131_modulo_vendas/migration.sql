-- AlterEnum
ALTER TYPE "SuiteModule" ADD VALUE 'SALES';

-- CreateTable
CREATE TABLE "VendasEtapa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendasEtapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendasLead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "empresa" TEXT,
    "email" TEXT,
    "telefone" TEXT NOT NULL,
    "mensagem" TEXT,
    "stageId" TEXT,
    "fonte" TEXT NOT NULL DEFAULT 'Site',
    "desfecho" "LeadDesfecho" NOT NULL DEFAULT 'ABERTO',
    "motivoPerda" TEXT,
    "valor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendasLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendasAtividade" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "tipo" "LeadActivityTipo" NOT NULL,
    "conteudo" TEXT NOT NULL,
    "autorNome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendasAtividade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendasEtapa_tenantId_ordem_idx" ON "VendasEtapa"("tenantId", "ordem");

-- CreateIndex
CREATE INDEX "VendasLead_tenantId_createdAt_idx" ON "VendasLead"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "VendasLead_tenantId_stageId_idx" ON "VendasLead"("tenantId", "stageId");

-- CreateIndex
CREATE INDEX "VendasAtividade_leadId_createdAt_idx" ON "VendasAtividade"("leadId", "createdAt");

-- AddForeignKey
ALTER TABLE "VendasEtapa" ADD CONSTRAINT "VendasEtapa_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendasLead" ADD CONSTRAINT "VendasLead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendasLead" ADD CONSTRAINT "VendasLead_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "VendasEtapa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendasAtividade" ADD CONSTRAINT "VendasAtividade_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "VendasLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
