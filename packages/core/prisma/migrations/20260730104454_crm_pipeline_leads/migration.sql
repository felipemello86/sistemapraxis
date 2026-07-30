-- CreateEnum
CREATE TYPE "LeadActivityTipo" AS ENUM ('NOTA', 'MUDANCA_ETAPA', 'MENSAGEM');

-- AlterTable
ALTER TABLE "DemoLead" ADD COLUMN     "motivoPerda" TEXT,
ADD COLUMN     "responsavelId" TEXT,
ADD COLUMN     "stageId" TEXT;

-- CreateTable
CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "ehGanho" BOOLEAN NOT NULL DEFAULT false,
    "ehPerdido" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "tipo" "LeadActivityTipo" NOT NULL,
    "conteudo" TEXT NOT NULL,
    "autorNome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelineStage_ordem_idx" ON "PipelineStage"("ordem");

-- CreateIndex
CREATE INDEX "LeadActivity_leadId_createdAt_idx" ON "LeadActivity"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "DemoLead_stageId_idx" ON "DemoLead"("stageId");

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "DemoLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoLead" ADD CONSTRAINT "DemoLead_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoLead" ADD CONSTRAINT "DemoLead_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "PlatformAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
