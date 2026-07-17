-- CreateEnum
CREATE TYPE "ReviewPlatform" AS ENUM ('BOOKING', 'AIRBNB');

-- CreateEnum
CREATE TYPE "ReviewStage" AS ENUM ('RECEBIDA', 'ANALISE_PLANEJAMENTO', 'EXECUCAO', 'AVALIACAO_EFICACIA', 'FINALIZADA');

-- CreateEnum
CREATE TYPE "ReviewAlertChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "ReviewAlertType" AS ENUM ('COLETA_NAO_REALIZADA', 'ANALISE_NAO_REALIZADA', 'ACAO_VENCIDA', 'ANALISE_PLANEJAMENTO_CONCLUIDA', 'EXECUCAO_CONCLUIDA', 'DATA_EFICACIA_CHEGOU', 'CARD_FINALIZADO', 'AVALIACAO_ATENDIMENTO_RECEBIDA', 'PLANEJAMENTO_REABERTO', 'CARD_EXCLUIDO', 'PROPRIEDADE_PENDENTE', 'PLANEJAMENTO_REJEITADO');

-- CreateTable
CREATE TABLE "ReviewsConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "targetScore" DOUBLE PRECISION NOT NULL DEFAULT 4.8,
    "airbnbLastCollectedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uhId" TEXT NOT NULL,
    "platform" "ReviewPlatform" NOT NULL,
    "guestName" TEXT NOT NULL,
    "comment" TEXT,
    "ratingRaw" DOUBLE PRECISION NOT NULL,
    "ratingScaleMax" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "ratingNormalized" DOUBLE PRECISION NOT NULL,
    "checkInDate" TIMESTAMP(3),
    "guestSubmittedAt" TIMESTAMP(3) NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stage" "ReviewStage" NOT NULL DEFAULT 'RECEBIDA',
    "skippedToFinal" BOOLEAN NOT NULL DEFAULT false,
    "analysisDueAt" TIMESTAMP(3),
    "analyzedById" TEXT,
    "analysisCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewAttachment" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "contentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewLog" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewAttendant" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "attendantId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "observation" TEXT NOT NULL,

    CONSTRAINT "ReviewAttendant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewCategory" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "ReviewCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionPlan" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionItem" (
    "id" TEXT NOT NULL,
    "actionPlanId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,

    CONSTRAINT "ActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EfficacyCheck" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "completedAt" TIMESTAMP(3),
    "wasEffective" BOOLEAN,
    "notes" TEXT,

    CONSTRAINT "EfficacyCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingAirbnbImport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "ratingRaw" DOUBLE PRECISION NOT NULL,
    "guestSubmittedAt" TIMESTAMP(3) NOT NULL,
    "checkInDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingAirbnbImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "triggeredById" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewsCollected" INTEGER,
    "notes" TEXT,

    CONSTRAINT "CollectionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "ReviewAlertType" NOT NULL,
    "channel" "ReviewAlertChannel" NOT NULL,
    "message" TEXT NOT NULL,
    "targetUserIds" TEXT[],
    "reviewId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerialNote" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerialNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewsConfig_tenantId_key" ON "ReviewsConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_tenantId_name_key" ON "Category"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Review_tenantId_guestSubmittedAt_idx" ON "Review"("tenantId", "guestSubmittedAt");

-- CreateIndex
CREATE INDEX "Review_tenantId_stage_idx" ON "Review"("tenantId", "stage");

-- CreateIndex
CREATE INDEX "ReviewAttachment_reviewId_idx" ON "ReviewAttachment"("reviewId");

-- CreateIndex
CREATE INDEX "ReviewLog_reviewId_idx" ON "ReviewLog"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewAttendant_reviewId_attendantId_key" ON "ReviewAttendant"("reviewId", "attendantId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewCategory_reviewId_categoryId_key" ON "ReviewCategory"("reviewId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionPlan_reviewId_key" ON "ActionPlan"("reviewId");

-- CreateIndex
CREATE INDEX "ActionItem_dueDate_idx" ON "ActionItem"("dueDate");

-- CreateIndex
CREATE INDEX "ActionItem_actionPlanId_idx" ON "ActionItem"("actionPlanId");

-- CreateIndex
CREATE INDEX "EfficacyCheck_scheduledDate_idx" ON "EfficacyCheck"("scheduledDate");

-- CreateIndex
CREATE INDEX "EfficacyCheck_reviewId_idx" ON "EfficacyCheck"("reviewId");

-- CreateIndex
CREATE INDEX "PendingAirbnbImport_tenantId_idx" ON "PendingAirbnbImport"("tenantId");

-- CreateIndex
CREATE INDEX "ManagerialNote_reviewId_idx" ON "ManagerialNote"("reviewId");

-- AddForeignKey
ALTER TABLE "ReviewsConfig" ADD CONSTRAINT "ReviewsConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_uhId_fkey" FOREIGN KEY ("uhId") REFERENCES "UH"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_analyzedById_fkey" FOREIGN KEY ("analyzedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAttachment" ADD CONSTRAINT "ReviewAttachment_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAttachment" ADD CONSTRAINT "ReviewAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLog" ADD CONSTRAINT "ReviewLog_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLog" ADD CONSTRAINT "ReviewLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAttendant" ADD CONSTRAINT "ReviewAttendant_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAttendant" ADD CONSTRAINT "ReviewAttendant_attendantId_fkey" FOREIGN KEY ("attendantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCategory" ADD CONSTRAINT "ReviewCategory_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCategory" ADD CONSTRAINT "ReviewCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionPlan" ADD CONSTRAINT "ActionPlan_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_actionPlanId_fkey" FOREIGN KEY ("actionPlanId") REFERENCES "ActionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EfficacyCheck" ADD CONSTRAINT "EfficacyCheck_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingAirbnbImport" ADD CONSTRAINT "PendingAirbnbImport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRun" ADD CONSTRAINT "CollectionRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRun" ADD CONSTRAINT "CollectionRun_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerialNote" ADD CONSTRAINT "ManagerialNote_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerialNote" ADD CONSTRAINT "ManagerialNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
