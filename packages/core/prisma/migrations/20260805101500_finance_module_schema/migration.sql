-- AlterEnum
ALTER TYPE "SuiteModule" ADD VALUE 'FINANCE';

-- CreateTable
CREATE TABLE "FinanceCategoria" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "bloco" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceCategoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceContaConectada" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pluggyItemId" TEXT NOT NULL,
    "instituicao" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LOGIN_IN_PROGRESS',
    "ultimaSincronizacaoEm" TIMESTAMP(3),
    "erro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceContaConectada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceContaBancaria" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contaConectadaId" TEXT NOT NULL,
    "pluggyAccountId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "saldoAtual" DECIMAL(12,2),
    "limiteCredito" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceContaBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceLancamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoriaId" TEXT,
    "descricao" TEXT NOT NULL,
    "fornecedor" TEXT,
    "valor" DECIMAL(12,2) NOT NULL,
    "dataVencimento" TEXT NOT NULL,
    "parcelaGrupoId" TEXT,
    "parcelaNumero" INTEGER,
    "parcelaTotal" INTEGER,
    "recorrente" BOOLEAN NOT NULL DEFAULT false,
    "recorrenciaFimData" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'MANUAL',
    "contaBancariaId" TEXT,
    "pluggyTransactionId" TEXT,
    "centroCusto" TEXT,
    "observacoes" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceLancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceOrcamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alvoTipo" TEXT NOT NULL,
    "alvoChave" TEXT NOT NULL,
    "categoriaId" TEXT,
    "mes" VARCHAR(7) NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceOrcamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceCategoria_tenantId_nome_key" ON "FinanceCategoria"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "FinanceCategoria_tenantId_bloco_idx" ON "FinanceCategoria"("tenantId", "bloco");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceContaConectada_pluggyItemId_key" ON "FinanceContaConectada"("pluggyItemId");

-- CreateIndex
CREATE INDEX "FinanceContaConectada_tenantId_idx" ON "FinanceContaConectada"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceContaBancaria_pluggyAccountId_key" ON "FinanceContaBancaria"("pluggyAccountId");

-- CreateIndex
CREATE INDEX "FinanceContaBancaria_tenantId_idx" ON "FinanceContaBancaria"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceLancamento_pluggyTransactionId_key" ON "FinanceLancamento"("pluggyTransactionId");

-- CreateIndex
CREATE INDEX "FinanceLancamento_tenantId_dataVencimento_idx" ON "FinanceLancamento"("tenantId", "dataVencimento");

-- CreateIndex
CREATE INDEX "FinanceLancamento_tenantId_categoriaId_idx" ON "FinanceLancamento"("tenantId", "categoriaId");

-- CreateIndex
CREATE INDEX "FinanceLancamento_tenantId_recorrente_idx" ON "FinanceLancamento"("tenantId", "recorrente");

-- CreateIndex
CREATE INDEX "FinanceLancamento_parcelaGrupoId_idx" ON "FinanceLancamento"("parcelaGrupoId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceOrcamento_tenantId_alvoTipo_alvoChave_mes_key" ON "FinanceOrcamento"("tenantId", "alvoTipo", "alvoChave", "mes");

-- AddForeignKey
ALTER TABLE "FinanceCategoria" ADD CONSTRAINT "FinanceCategoria_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceContaConectada" ADD CONSTRAINT "FinanceContaConectada_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceContaBancaria" ADD CONSTRAINT "FinanceContaBancaria_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceContaBancaria" ADD CONSTRAINT "FinanceContaBancaria_contaConectadaId_fkey" FOREIGN KEY ("contaConectadaId") REFERENCES "FinanceContaConectada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLancamento" ADD CONSTRAINT "FinanceLancamento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLancamento" ADD CONSTRAINT "FinanceLancamento_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "FinanceCategoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceLancamento" ADD CONSTRAINT "FinanceLancamento_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "FinanceContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOrcamento" ADD CONSTRAINT "FinanceOrcamento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceOrcamento" ADD CONSTRAINT "FinanceOrcamento_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "FinanceCategoria"("id") ON DELETE CASCADE ON UPDATE CASCADE;
