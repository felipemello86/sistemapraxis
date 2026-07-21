-- AlterTable
ALTER TABLE "MaintenanceInspectionItem" ADD COLUMN     "corrigidoEm" TIMESTAMP(3),
ADD COLUMN     "photos" TEXT NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "MaintenanceCorrection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inspectionItemId" TEXT NOT NULL,
    "uhId" TEXT NOT NULL,
    "checklistItemId" TEXT,
    "authorId" TEXT,
    "description" TEXT NOT NULL,
    "photos" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceUnitChecklistItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uhId" TEXT NOT NULL,
    "checklistItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceUnitChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "maxDaysBetweenInspections" INTEGER NOT NULL DEFAULT 90,
    "goal" INTEGER NOT NULL DEFAULT 90,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenanceCorrection_tenantId_createdAt_idx" ON "MaintenanceCorrection"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "MaintenanceCorrection_inspectionItemId_idx" ON "MaintenanceCorrection"("inspectionItemId");

-- CreateIndex
CREATE INDEX "MaintenanceCorrection_uhId_idx" ON "MaintenanceCorrection"("uhId");

-- CreateIndex
CREATE INDEX "MaintenanceUnitChecklistItem_tenantId_idx" ON "MaintenanceUnitChecklistItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceUnitChecklistItem_uhId_checklistItemId_key" ON "MaintenanceUnitChecklistItem"("uhId", "checklistItemId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceConfig_tenantId_key" ON "MaintenanceConfig"("tenantId");

-- AddForeignKey
ALTER TABLE "MaintenanceCorrection" ADD CONSTRAINT "MaintenanceCorrection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCorrection" ADD CONSTRAINT "MaintenanceCorrection_inspectionItemId_fkey" FOREIGN KEY ("inspectionItemId") REFERENCES "MaintenanceInspectionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCorrection" ADD CONSTRAINT "MaintenanceCorrection_uhId_fkey" FOREIGN KEY ("uhId") REFERENCES "UH"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCorrection" ADD CONSTRAINT "MaintenanceCorrection_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "MaintenanceChecklistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCorrection" ADD CONSTRAINT "MaintenanceCorrection_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceUnitChecklistItem" ADD CONSTRAINT "MaintenanceUnitChecklistItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceUnitChecklistItem" ADD CONSTRAINT "MaintenanceUnitChecklistItem_uhId_fkey" FOREIGN KEY ("uhId") REFERENCES "UH"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceUnitChecklistItem" ADD CONSTRAINT "MaintenanceUnitChecklistItem_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "MaintenanceChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceConfig" ADD CONSTRAINT "MaintenanceConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

