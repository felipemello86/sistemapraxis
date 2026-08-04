-- AlterTable
ALTER TABLE "InspectionSession" ADD COLUMN     "liberadaSemInspecao" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InspectionSession" ADD COLUMN     "justificativaLiberacao" TEXT;
