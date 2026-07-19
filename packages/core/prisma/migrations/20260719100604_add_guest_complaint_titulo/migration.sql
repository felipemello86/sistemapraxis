-- AlterTable (nullable first -- tabela ja tem registros reais)
ALTER TABLE "GuestComplaint" ADD COLUMN "titulo" TEXT;

-- Backfill dos registros existentes (criados antes deste campo existir)
-- com a propria descricao como titulo, ja que era curta o suficiente.
UPDATE "GuestComplaint" SET "titulo" = "descricao" WHERE "titulo" IS NULL;

-- Agora sim, obrigatorio daqui pra frente.
ALTER TABLE "GuestComplaint" ALTER COLUMN "titulo" SET NOT NULL;
