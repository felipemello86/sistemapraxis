-- AlterTable
ALTER TABLE "HkBlockRequest" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'BLOQUEIO';

-- AlterTable
ALTER TABLE "UH" ADD COLUMN "manutencaoSolicitanteNome" TEXT,
ADD COLUMN "manutencaoEm" TIMESTAMP(3);
