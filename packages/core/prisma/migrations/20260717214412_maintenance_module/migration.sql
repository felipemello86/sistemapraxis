-- CreateTable
CREATE TABLE "MaintenanceChecklistItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceInspection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uhId" TEXT NOT NULL,
    "inspectorId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceInspectionItem" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "checklistItemId" TEXT,
    "status" TEXT NOT NULL,
    "comment" TEXT,

    CONSTRAINT "MaintenanceInspectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenanceChecklistItem_tenantId_idx" ON "MaintenanceChecklistItem"("tenantId");

-- CreateIndex
CREATE INDEX "MaintenanceInspection_tenantId_date_idx" ON "MaintenanceInspection"("tenantId", "date");

-- CreateIndex
CREATE INDEX "MaintenanceInspection_uhId_idx" ON "MaintenanceInspection"("uhId");

-- CreateIndex
CREATE INDEX "MaintenanceInspectionItem_inspectionId_idx" ON "MaintenanceInspectionItem"("inspectionId");

-- AddForeignKey
ALTER TABLE "MaintenanceChecklistItem" ADD CONSTRAINT "MaintenanceChecklistItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceInspection" ADD CONSTRAINT "MaintenanceInspection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceInspection" ADD CONSTRAINT "MaintenanceInspection_uhId_fkey" FOREIGN KEY ("uhId") REFERENCES "UH"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceInspection" ADD CONSTRAINT "MaintenanceInspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceInspectionItem" ADD CONSTRAINT "MaintenanceInspectionItem_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "MaintenanceInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceInspectionItem" ADD CONSTRAINT "MaintenanceInspectionItem_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "MaintenanceChecklistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
