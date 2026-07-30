-- CreateEnum
CREATE TYPE "WhatsAppDirecao" AS ENUM ('ENVIADA', 'RECEBIDA');

-- CreateEnum
CREATE TYPE "WhatsAppMensagemStatus" AS ENUM ('ENVIADA', 'ENTREGUE', 'LIDA', 'FALHOU');

-- CreateTable
CREATE TABLE "WhatsAppMensagem" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "direcao" "WhatsAppDirecao" NOT NULL,
    "conteudo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'texto',
    "midiaUrl" TEXT,
    "waMessageId" TEXT,
    "status" "WhatsAppMensagemStatus" NOT NULL DEFAULT 'ENVIADA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMensagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMensagem_waMessageId_key" ON "WhatsAppMensagem"("waMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppMensagem_leadId_createdAt_idx" ON "WhatsAppMensagem"("leadId", "createdAt");

-- AddForeignKey
ALTER TABLE "WhatsAppMensagem" ADD CONSTRAINT "WhatsAppMensagem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "DemoLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
