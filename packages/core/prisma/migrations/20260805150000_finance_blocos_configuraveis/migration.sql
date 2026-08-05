-- Blocos (super-categorias) configuráveis (pedido do Felipe, 05/08/2026):
-- substitui o enum fixo de 8 blocos por uma tabela por tenant. Esta migration
-- só faz a parte estruturalmente segura (aditiva) — cria FinanceBloco e
-- adiciona FinanceCategoria.blocoId ainda NULLABLE e sem FK. O backfill dos
-- dados existentes (criar os 8 blocos default por tenant, apontar cada
-- categoria pro bloco certo, migrar FinanceOrcamento.alvoChave de BLOCO) e a
-- finalização do schema (NOT NULL + FK + drop da coluna "bloco" antiga)
-- rodam depois via packages/core/scripts/migrar-blocos-financeiro.ts —
-- precisa ser um script (não SQL puro) porque precisa gerar cuid() novo por
-- bloco, igual ao resto do app.

-- CreateTable
CREATE TABLE "FinanceBloco" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "totalizador" TEXT NOT NULL,
    "sinal" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceBloco_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceBloco_tenantId_nome_key" ON "FinanceBloco"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "FinanceBloco_tenantId_totalizador_idx" ON "FinanceBloco"("tenantId", "totalizador");

-- AddForeignKey
ALTER TABLE "FinanceBloco" ADD CONSTRAINT "FinanceBloco_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable (nullable por enquanto — vira NOT NULL só depois do backfill)
ALTER TABLE "FinanceCategoria" ADD COLUMN "blocoId" TEXT;
