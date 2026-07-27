-- CreateTable
CREATE TABLE "MaintenanceConformitySnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "conformidade" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceConformitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenanceConformitySnapshot_tenantId_data_idx" ON "MaintenanceConformitySnapshot"("tenantId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceConformitySnapshot_tenantId_data_key" ON "MaintenanceConformitySnapshot"("tenantId", "data");

-- AddForeignKey
ALTER TABLE "MaintenanceConformitySnapshot" ADD CONSTRAINT "MaintenanceConformitySnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
