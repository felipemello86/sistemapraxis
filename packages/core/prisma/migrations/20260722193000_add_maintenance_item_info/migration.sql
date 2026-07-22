-- CreateTable
CREATE TABLE "MaintenanceItemInfo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uhId" TEXT NOT NULL,
    "checklistItemId" TEXT NOT NULL,
    "info" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceItemInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceItemInfoLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemInfoId" TEXT NOT NULL,
    "uhId" TEXT NOT NULL,
    "checklistItemId" TEXT NOT NULL,
    "previousInfo" TEXT,
    "newInfo" TEXT,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceItemInfoLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenanceItemInfo_tenantId_idx" ON "MaintenanceItemInfo"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceItemInfo_uhId_checklistItemId_key" ON "MaintenanceItemInfo"("uhId", "checklistItemId");

-- CreateIndex
CREATE INDEX "MaintenanceItemInfoLog_tenantId_createdAt_idx" ON "MaintenanceItemInfoLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "MaintenanceItemInfoLog_itemInfoId_idx" ON "MaintenanceItemInfoLog"("itemInfoId");

-- CreateIndex
CREATE INDEX "MaintenanceItemInfoLog_uhId_idx" ON "MaintenanceItemInfoLog"("uhId");

-- AddForeignKey
ALTER TABLE "MaintenanceItemInfo" ADD CONSTRAINT "MaintenanceItemInfo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceItemInfo" ADD CONSTRAINT "MaintenanceItemInfo_uhId_fkey" FOREIGN KEY ("uhId") REFERENCES "UH"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceItemInfo" ADD CONSTRAINT "MaintenanceItemInfo_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "MaintenanceChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceItemInfo" ADD CONSTRAINT "MaintenanceItemInfo_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceItemInfoLog" ADD CONSTRAINT "MaintenanceItemInfoLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceItemInfoLog" ADD CONSTRAINT "MaintenanceItemInfoLog_itemInfoId_fkey" FOREIGN KEY ("itemInfoId") REFERENCES "MaintenanceItemInfo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceItemInfoLog" ADD CONSTRAINT "MaintenanceItemInfoLog_uhId_fkey" FOREIGN KEY ("uhId") REFERENCES "UH"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceItemInfoLog" ADD CONSTRAINT "MaintenanceItemInfoLog_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "MaintenanceChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceItemInfoLog" ADD CONSTRAINT "MaintenanceItemInfoLog_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
