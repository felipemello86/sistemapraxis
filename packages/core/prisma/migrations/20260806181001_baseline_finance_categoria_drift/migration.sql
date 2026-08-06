-- Migration de "baseline" (06/08/2026) — não representa uma mudança nova,
-- registra no histórico algo que já tinha sido aplicado direto no banco
-- (fora do fluxo normal de `prisma migrate dev`) durante o trabalho do
-- módulo Financeiro, deixando o histórico de migrations dessincronizado
-- do schema real (detectado como "drift" ao tentar rodar a migration do
-- módulo Vendas — Prisma pediu reset do banco de produção, recusado).
--
-- Confirmado por introspecção direta da tabela FinanceCategoria em
-- 06/08/2026: o banco já está exatamente neste estado (bloco removida,
-- blocoId NOT NULL + índice + FK). Este arquivo é marcado como já
-- aplicado via `prisma migrate resolve --applied` (não roda de verdade
-- contra o banco de produção agora), mas fica aqui pra qualquer ambiente
-- NOVO (CI, banco de desenvolvimento do zero) nascer no estado certo.

DROP INDEX IF EXISTS "FinanceCategoria_tenantId_bloco_idx";

ALTER TABLE "FinanceCategoria" DROP COLUMN IF EXISTS "bloco";

ALTER TABLE "FinanceCategoria" ALTER COLUMN "blocoId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "FinanceCategoria_tenantId_blocoId_idx" ON "FinanceCategoria"("tenantId", "blocoId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FinanceCategoria_blocoId_fkey'
  ) THEN
    ALTER TABLE "FinanceCategoria"
      ADD CONSTRAINT "FinanceCategoria_blocoId_fkey"
      FOREIGN KEY ("blocoId") REFERENCES "FinanceBloco"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
