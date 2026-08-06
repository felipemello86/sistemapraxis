-- CreateEnum
CREATE TYPE "CanalProvedor" AS ENUM ('WHATSAPP');

-- CreateEnum
CREATE TYPE "CanalStatus" AS ENUM ('PENDENTE', 'CONECTADO', 'ERRO');

-- CreateEnum
CREATE TYPE "VendasMensagemDirecao" AS ENUM ('ENVIADA', 'RECEBIDA');

-- CreateEnum
CREATE TYPE "VendasMensagemStatus" AS ENUM ('ENVIADA', 'ENTREGUE', 'LIDA', 'FALHOU');

-- CreateTable
CREATE TABLE "ChannelConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "CanalProvedor" NOT NULL DEFAULT 'WHATSAPP',
    "status" "CanalStatus" NOT NULL DEFAULT 'PENDENTE',
    "erro" TEXT,
    "wabaId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "displayPhoneNumber" TEXT,
    "verifiedName" TEXT,
    "accessTokenCifrado" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendasMensagem" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "direcao" "VendasMensagemDirecao" NOT NULL,
    "conteudo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'texto',
    "midiaUrl" TEXT,
    "waMessageId" TEXT,
    "status" "VendasMensagemStatus" NOT NULL DEFAULT 'ENVIADA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendasMensagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConnection_phoneNumberId_key" ON "ChannelConnection"("phoneNumberId");

-- CreateIndex
CREATE INDEX "ChannelConnection_wabaId_idx" ON "ChannelConnection"("wabaId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConnection_tenantId_provider_key" ON "ChannelConnection"("tenantId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "VendasMensagem_waMessageId_key" ON "VendasMensagem"("waMessageId");

-- CreateIndex
CREATE INDEX "VendasMensagem_leadId_createdAt_idx" ON "VendasMensagem"("leadId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChannelConnection" ADD CONSTRAINT "ChannelConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendasMensagem" ADD CONSTRAINT "VendasMensagem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "VendasLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
