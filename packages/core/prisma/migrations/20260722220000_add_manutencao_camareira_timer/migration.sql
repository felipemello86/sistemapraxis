-- AlterTable
ALTER TABLE "CleaningSession" ADD COLUMN "manutencaoAbertaEm" TIMESTAMP(3);
ALTER TABLE "CleaningSession" ADD COLUMN "manutencaoSegundosExcluidos" INTEGER NOT NULL DEFAULT 0;
