-- Pedido do Felipe, 07/08/2026: "Transações Automatizadas" — pagamentos
-- recorrentes a terceiros (vale-transporte, salário, conta de energia...)
-- com aprovação em duas etapas (GERENTE confirma o valor, MASTER confirma
-- que efetuou o pagamento). Ver comentário completo em schema.prisma,
-- acima do model FinanceTransacaoAutomatizada.
-- CreateTable
CREATE TABLE "FinanceTransacaoAutomatizada" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "favorecido" TEXT NOT NULL,
    "dadosBancarios" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "diaDoMes" INTEGER NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "centroCustoTipo" TEXT NOT NULL DEFAULT 'ADMINISTRACAO',
    "propertyId" TEXT,
    "uhId" TEXT,
    "contaBancariaId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoPorNome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceTransacaoAutomatizada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceTransacaoExecucao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "transacaoAutomatizadaId" TEXT NOT NULL,
    "mesReferencia" TEXT NOT NULL,
    "valorSugerido" DECIMAL(12,2) NOT NULL,
    "valorConfirmado" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO_GERENTE',
    "confirmadoGerentePorNome" TEXT,
    "confirmadoGerenteEm" TIMESTAMP(3),
    "confirmadoMasterPorNome" TEXT,
    "confirmadoMasterEm" TIMESTAMP(3),
    "motivoRejeicao" TEXT,
    "lancamentoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceTransacaoExecucao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceTransacaoAutomatizada_tenantId_ativo_idx" ON "FinanceTransacaoAutomatizada"("tenantId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceTransacaoExecucao_lancamentoId_key" ON "FinanceTransacaoExecucao"("lancamentoId");

-- CreateIndex
CREATE INDEX "FinanceTransacaoExecucao_tenantId_status_idx" ON "FinanceTransacaoExecucao"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceTransacaoExecucao_transacaoAutomatizadaId_mesReferen_key" ON "FinanceTransacaoExecucao"("transacaoAutomatizadaId", "mesReferencia");

-- AddForeignKey
ALTER TABLE "FinanceTransacaoAutomatizada" ADD CONSTRAINT "FinanceTransacaoAutomatizada_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransacaoAutomatizada" ADD CONSTRAINT "FinanceTransacaoAutomatizada_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "FinanceCategoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransacaoExecucao" ADD CONSTRAINT "FinanceTransacaoExecucao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceTransacaoExecucao" ADD CONSTRAINT "FinanceTransacaoExecucao_transacaoAutomatizadaId_fkey" FOREIGN KEY ("transacaoAutomatizadaId") REFERENCES "FinanceTransacaoAutomatizada"("id") ON DELETE CASCADE ON UPDATE CASCADE;
