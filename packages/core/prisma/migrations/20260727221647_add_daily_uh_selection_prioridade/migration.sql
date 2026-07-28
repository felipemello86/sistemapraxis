-- AlterTable
ALTER TABLE "DailyUHSelection" ADD COLUMN     "prioridade" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "prioridadeDescricao" TEXT,
ADD COLUMN     "prioridadePorNome" TEXT,
ADD COLUMN     "prioridadeEm" TIMESTAMP(3);
