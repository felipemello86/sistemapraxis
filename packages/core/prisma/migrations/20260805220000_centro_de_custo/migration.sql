-- Centro de Custo (pedido do Felipe, 05/08/2026): hierarquia Administração
-- -> Empreendimento -> Unidade. Substitui o campo livre "centroCusto" por
-- estrutura de verdade, com rateio calculado em tempo de consulta na DRE
-- (ver lib/finance/centro-de-custo.ts) — nada aqui grava valor rateado.

-- CreateTable
CREATE TABLE "FinanceEmpreendimento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceEmpreendimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceUnidade" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "empreendimentoId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceUnidade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceEmpreendimento_tenantId_nome_key" ON "FinanceEmpreendimento"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "FinanceEmpreendimento_tenantId_idx" ON "FinanceEmpreendimento"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceUnidade_empreendimentoId_nome_key" ON "FinanceUnidade"("empreendimentoId", "nome");

-- CreateIndex
CREATE INDEX "FinanceUnidade_tenantId_idx" ON "FinanceUnidade"("tenantId");

-- CreateIndex
CREATE INDEX "FinanceUnidade_empreendimentoId_idx" ON "FinanceUnidade"("empreendimentoId");

-- AddForeignKey
ALTER TABLE "FinanceEmpreendimento" ADD CONSTRAINT "FinanceEmpreendimento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceUnidade" ADD CONSTRAINT "FinanceUnidade_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceUnidade" ADD CONSTRAINT "FinanceUnidade_empreendimentoId_fkey" FOREIGN KEY ("empreendimentoId") REFERENCES "FinanceEmpreendimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable FinanceLancamento: troca centroCusto (texto livre) pela estrutura nova
ALTER TABLE "FinanceLancamento" DROP COLUMN "centroCusto";
ALTER TABLE "FinanceLancamento" ADD COLUMN "centroCustoTipo" TEXT NOT NULL DEFAULT 'ADMINISTRACAO';
ALTER TABLE "FinanceLancamento" ADD COLUMN "empreendimentoId" TEXT;
ALTER TABLE "FinanceLancamento" ADD COLUMN "unidadeId" TEXT;

-- CreateIndex
CREATE INDEX "FinanceLancamento_tenantId_empreendimentoId_idx" ON "FinanceLancamento"("tenantId", "empreendimentoId");

-- CreateIndex
CREATE INDEX "FinanceLancamento_tenantId_unidadeId_idx" ON "FinanceLancamento"("tenantId", "unidadeId");

-- AddForeignKey
ALTER TABLE "FinanceLancamento" ADD CONSTRAINT "FinanceLancamento_empreendimentoId_fkey" FOREIGN KEY ("empreendimentoId") REFERENCES "FinanceEmpreendimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLancamento" ADD CONSTRAINT "FinanceLancamento_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "FinanceUnidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
