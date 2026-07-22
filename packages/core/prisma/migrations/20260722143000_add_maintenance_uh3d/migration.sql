-- CreateTable
CREATE TABLE "MaintenanceUhImage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uhId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceUhImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceUhSpot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "checklistItemId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceUhSpot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenanceUhImage_tenantId_idx" ON "MaintenanceUhImage"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceUhImage_uhId_tipo_key" ON "MaintenanceUhImage"("uhId", "tipo");

-- CreateIndex
CREATE INDEX "MaintenanceUhSpot_tenantId_idx" ON "MaintenanceUhSpot"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceUhSpot_imageId_checklistItemId_key" ON "MaintenanceUhSpot"("imageId", "checklistItemId");

-- AddForeignKey
ALTER TABLE "MaintenanceUhImage" ADD CONSTRAINT "MaintenanceUhImage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceUhImage" ADD CONSTRAINT "MaintenanceUhImage_uhId_fkey" FOREIGN KEY ("uhId") REFERENCES "UH"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceUhSpot" ADD CONSTRAINT "MaintenanceUhSpot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceUhSpot" ADD CONSTRAINT "MaintenanceUhSpot_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "MaintenanceUhImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceUhSpot" ADD CONSTRAINT "MaintenanceUhSpot_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "MaintenanceChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
