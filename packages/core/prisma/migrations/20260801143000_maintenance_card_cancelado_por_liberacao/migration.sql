-- AlterTable
ALTER TABLE "MaintenanceCorrectionCard" ADD COLUMN     "canceladoPorLiberacao" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canceladoEm" TIMESTAMP(3);
