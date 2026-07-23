-- AlterTable
ALTER TABLE "UH" ADD COLUMN "bloqueioOrigem" TEXT;

-- AlterTable
ALTER TABLE "MaintenanceInspectionItem" ADD COLUMN "urgente" BOOLEAN NOT NULL DEFAULT false;
