-- CreateEnum
CREATE TYPE "AiInsightPriority" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "AiInsightStatus" AS ENUM ('ABERTO', 'LIDO', 'RESOLVIDO', 'DESCARTADO');

-- AlterEnum
ALTER TYPE "SuiteModule" ADD VALUE 'INTELLIGENCE';

-- CreateTable
CREATE TABLE "AiEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiEntitySnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metrics" TEXT NOT NULL DEFAULT '{}',
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiEntitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInsight" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "detectorId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "priority" "AiInsightPriority" NOT NULL,
    "status" "AiInsightStatus" NOT NULL DEFAULT 'ABERTO',
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidence" TEXT NOT NULL DEFAULT '[]',
    "confidence" DOUBLE PRECISION NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "eventIds" TEXT NOT NULL DEFAULT '[]',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiEvent_tenantId_module_createdAt_idx" ON "AiEvent"("tenantId", "module", "createdAt");

-- CreateIndex
CREATE INDEX "AiEvent_tenantId_entityType_entityId_idx" ON "AiEvent"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AiEvent_tenantId_eventType_createdAt_idx" ON "AiEvent"("tenantId", "eventType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiEntitySnapshot_tenantId_module_entityType_entityId_key" ON "AiEntitySnapshot"("tenantId", "module", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AiInsight_tenantId_module_status_priority_idx" ON "AiInsight"("tenantId", "module", "status", "priority");

-- CreateIndex
CREATE INDEX "AiInsight_tenantId_status_lastSeenAt_idx" ON "AiInsight"("tenantId", "status", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiInsight_tenantId_dedupeKey_key" ON "AiInsight"("tenantId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "AiEvent" ADD CONSTRAINT "AiEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEntitySnapshot" ADD CONSTRAINT "AiEntitySnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
