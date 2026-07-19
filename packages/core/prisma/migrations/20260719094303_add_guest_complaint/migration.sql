-- AlterEnum
ALTER TYPE "ReviewPlatform" ADD VALUE 'INTERNO';

-- CreateTable
CREATE TABLE "GuestComplaint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "uhId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "registradoPorId" TEXT NOT NULL,
    "registradoPorNome" TEXT NOT NULL,
    "camareiraId" TEXT,
    "pontosDescontados" INTEGER,
    "reviewId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestComplaint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuestComplaint_reviewId_key" ON "GuestComplaint"("reviewId");

-- CreateIndex
CREATE INDEX "GuestComplaint_tenantId_data_uhId_idx" ON "GuestComplaint"("tenantId", "data", "uhId");

-- CreateIndex
CREATE INDEX "GuestComplaint_tenantId_camareiraId_idx" ON "GuestComplaint"("tenantId", "camareiraId");

-- AddForeignKey
ALTER TABLE "GuestComplaint" ADD CONSTRAINT "GuestComplaint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestComplaint" ADD CONSTRAINT "GuestComplaint_uhId_fkey" FOREIGN KEY ("uhId") REFERENCES "UH"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestComplaint" ADD CONSTRAINT "GuestComplaint_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestComplaint" ADD CONSTRAINT "GuestComplaint_camareiraId_fkey" FOREIGN KEY ("camareiraId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestComplaint" ADD CONSTRAINT "GuestComplaint_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE SET NULL ON UPDATE CASCADE;

