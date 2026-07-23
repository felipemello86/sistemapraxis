-- AlterTable
ALTER TABLE "MaintenanceCorrectionCard" ADD COLUMN "previsto" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "MaintenanceDailyCommitment" ADD COLUMN "totalPrevisto" INTEGER NOT NULL DEFAULT 0;

-- Backfill: commitments já fechados antes desta migration não tinham esse
-- campo — assume que todos os cards já vinculados a cada commitment eram
-- "previstos" (não havia como adicionar depois até agora), então o
-- denominador congelado vira a contagem atual de cards por commitment.
UPDATE "MaintenanceDailyCommitment" dc
SET "totalPrevisto" = sub.total
FROM (
  SELECT "dailyCommitmentId", COUNT(*) AS total
  FROM "MaintenanceCorrectionCard"
  WHERE "dailyCommitmentId" IS NOT NULL
  GROUP BY "dailyCommitmentId"
) sub
WHERE dc.id = sub."dailyCommitmentId";
