-- CreateTable
CREATE TABLE "MaintenanceCorrectionCard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inspectionItemId" TEXT NOT NULL,
    "uhId" TEXT NOT NULL,
    "checklistItemId" TEXT,
    "needsMaterial" BOOLEAN,
    "needsExternalService" BOOLEAN,
    "triagedAt" TIMESTAMP(3),
    "triagedById" TEXT,
    "materialStatus" TEXT NOT NULL DEFAULT 'A_ADQUIRIR',
    "materialReceiptPhoto" TEXT,
    "materialCompradoEm" TIMESTAMP(3),
    "materialCompradoPorId" TEXT,
    "externalServiceStatus" TEXT NOT NULL DEFAULT 'A_CONTRATAR',
    "hiredSupplierId" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "scheduledById" TEXT,
    "executionStatus" TEXT NOT NULL DEFAULT 'A_FAZER',
    "dailyCommitmentId" TEXT,
    "blockForReservation" BOOLEAN,
    "executedDescription" TEXT,
    "executedPhotos" TEXT NOT NULL DEFAULT '[]',
    "executedAt" TIMESTAMP(3),
    "executedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceCorrectionCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceSupplier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "contato" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceSupplierChecklistItem" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "checklistItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceSupplierChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceCorrectionSupplierQuote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceCorrectionSupplierQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceSchedulingLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "previousSupplierId" TEXT,
    "previousSupplierNome" TEXT,
    "previousDate" TIMESTAMP(3),
    "newSupplierId" TEXT,
    "newSupplierNome" TEXT,
    "newDate" TIMESTAMP(3),
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceSchedulingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceDailyCommitment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT,
    "conformidadeAntes" INTEGER,
    "conformidadeDepois" INTEGER,
    "reportSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceDailyCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceCorrectionCard_inspectionItemId_key" ON "MaintenanceCorrectionCard"("inspectionItemId");

-- CreateIndex
CREATE INDEX "MaintenanceCorrectionCard_tenantId_idx" ON "MaintenanceCorrectionCard"("tenantId");

-- CreateIndex
CREATE INDEX "MaintenanceCorrectionCard_uhId_idx" ON "MaintenanceCorrectionCard"("uhId");

-- CreateIndex
CREATE INDEX "MaintenanceCorrectionCard_dailyCommitmentId_idx" ON "MaintenanceCorrectionCard"("dailyCommitmentId");

-- CreateIndex
CREATE INDEX "MaintenanceSupplier_tenantId_idx" ON "MaintenanceSupplier"("tenantId");

-- CreateIndex
CREATE INDEX "MaintenanceSupplierChecklistItem_checklistItemId_idx" ON "MaintenanceSupplierChecklistItem"("checklistItemId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceSupplierChecklistItem_supplierId_checklistItemId_key" ON "MaintenanceSupplierChecklistItem"("supplierId", "checklistItemId");

-- CreateIndex
CREATE INDEX "MaintenanceCorrectionSupplierQuote_cardId_idx" ON "MaintenanceCorrectionSupplierQuote"("cardId");

-- CreateIndex
CREATE INDEX "MaintenanceCorrectionSupplierQuote_tenantId_idx" ON "MaintenanceCorrectionSupplierQuote"("tenantId");

-- CreateIndex
CREATE INDEX "MaintenanceSchedulingLog_cardId_idx" ON "MaintenanceSchedulingLog"("cardId");

-- CreateIndex
CREATE INDEX "MaintenanceSchedulingLog_tenantId_idx" ON "MaintenanceSchedulingLog"("tenantId");

-- CreateIndex
CREATE INDEX "MaintenanceDailyCommitment_tenantId_data_idx" ON "MaintenanceDailyCommitment"("tenantId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceDailyCommitment_tenantId_data_key" ON "MaintenanceDailyCommitment"("tenantId", "data");

-- AddForeignKey
ALTER TABLE "MaintenanceCorrectionCard" ADD CONSTRAINT "MaintenanceCorrectionCard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCorrectionCard" ADD CONSTRAINT "MaintenanceCorrectionCard_inspectionItemId_fkey" FOREIGN KEY ("inspectionItemId") REFERENCES "MaintenanceInspectionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCorrectionCard" ADD CONSTRAINT "MaintenanceCorrectionCard_uhId_fkey" FOREIGN KEY ("uhId") REFERENCES "UH"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCorrectionCard" ADD CONSTRAINT "MaintenanceCorrectionCard_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "MaintenanceChecklistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCorrectionCard" ADD CONSTRAINT "MaintenanceCorrectionCard_triagedById_fkey" FOREIGN KEY ("triagedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCorrectionCard" ADD CONSTRAINT "MaintenanceCorrectionCard_materialCompradoPorId_fkey" FOREIGN KEY ("materialCompradoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCorrectionCard" ADD CONSTRAINT "MaintenanceCorrectionCard_hiredSupplierId_fkey" FOREIGN KEY ("hiredSupplierId") REFERENCES "MaintenanceSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCorrectionCard" ADD CONSTRAINT "MaintenanceCorrectionCard_scheduledById_fkey" FOREIGN KEY ("scheduledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCorrectionCard" ADD CONSTRAINT "MaintenanceCorrectionCard_dailyCommitmentId_fkey" FOREIGN KEY ("dailyCommitmentId") REFERENCES "MaintenanceDailyCommitment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCorrectionCard" ADD CONSTRAINT "MaintenanceCorrectionCard_executedById_fkey" FOREIGN KEY ("executedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceSupplier" ADD CONSTRAINT "MaintenanceSupplier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceSupplierChecklistItem" ADD CONSTRAINT "MaintenanceSupplierChecklistItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "MaintenanceSupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceSupplierChecklistItem" ADD CONSTRAINT "MaintenanceSupplierChecklistItem_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "MaintenanceChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCorrectionSupplierQuote" ADD CONSTRAINT "MaintenanceCorrectionSupplierQuote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCorrectionSupplierQuote" ADD CONSTRAINT "MaintenanceCorrectionSupplierQuote_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "MaintenanceCorrectionCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCorrectionSupplierQuote" ADD CONSTRAINT "MaintenanceCorrectionSupplierQuote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "MaintenanceSupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceCorrectionSupplierQuote" ADD CONSTRAINT "MaintenanceCorrectionSupplierQuote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceSchedulingLog" ADD CONSTRAINT "MaintenanceSchedulingLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceSchedulingLog" ADD CONSTRAINT "MaintenanceSchedulingLog_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "MaintenanceCorrectionCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceSchedulingLog" ADD CONSTRAINT "MaintenanceSchedulingLog_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceDailyCommitment" ADD CONSTRAINT "MaintenanceDailyCommitment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceDailyCommitment" ADD CONSTRAINT "MaintenanceDailyCommitment_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
