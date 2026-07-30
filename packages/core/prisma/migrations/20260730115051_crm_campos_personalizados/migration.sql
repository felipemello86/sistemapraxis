-- CreateEnum
CREATE TYPE "LeadCampoTipo" AS ENUM ('TEXTO', 'NUMERO', 'DATA', 'SELECAO');

-- CreateTable
CREATE TABLE "LeadCampoPersonalizado" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "LeadCampoTipo" NOT NULL DEFAULT 'TEXTO',
    "ordem" INTEGER NOT NULL,
    "opcoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadCampoPersonalizado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadCampoValor" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "campoId" TEXT NOT NULL,
    "valor" TEXT NOT NULL,

    CONSTRAINT "LeadCampoValor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadCampoPersonalizado_ordem_idx" ON "LeadCampoPersonalizado"("ordem");

-- CreateIndex
CREATE UNIQUE INDEX "LeadCampoValor_leadId_campoId_key" ON "LeadCampoValor"("leadId", "campoId");

-- AddForeignKey
ALTER TABLE "LeadCampoValor" ADD CONSTRAINT "LeadCampoValor_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "DemoLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCampoValor" ADD CONSTRAINT "LeadCampoValor_campoId_fkey" FOREIGN KEY ("campoId") REFERENCES "LeadCampoPersonalizado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
