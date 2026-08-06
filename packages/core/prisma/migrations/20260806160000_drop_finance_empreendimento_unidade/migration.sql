-- Financeiro passa a usar Property/UH reais (Gateway) em vez do cadastro
-- próprio FinanceEmpreendimento/FinanceUnidade (pedido do Felipe,
-- 06/08/2026). Etapa 2/2: agora que propertyId/uhId já existem em
-- FinanceLancamento (migration anterior) e a migração de dados foi
-- confirmada (zero lançamentos referenciavam empreendimentoId/unidadeId —
-- todos ADMINISTRACAO), removemos as colunas antigas e as tabelas próprias.

-- DropForeignKey
ALTER TABLE "FinanceLancamento" DROP CONSTRAINT "FinanceLancamento_empreendimentoId_fkey";
ALTER TABLE "FinanceLancamento" DROP CONSTRAINT "FinanceLancamento_unidadeId_fkey";

-- DropIndex (dropadas automaticamente pelo DROP COLUMN abaixo, listadas aqui
-- só por clareza/documentação)
-- FinanceLancamento_tenantId_empreendimentoId_idx
-- FinanceLancamento_tenantId_unidadeId_idx

-- AlterTable
ALTER TABLE "FinanceLancamento" DROP COLUMN "empreendimentoId";
ALTER TABLE "FinanceLancamento" DROP COLUMN "unidadeId";

-- DropForeignKey (FinanceUnidade -> FinanceEmpreendimento)
ALTER TABLE "FinanceUnidade" DROP CONSTRAINT "FinanceUnidade_empreendimentoId_fkey";

-- DropTable
DROP TABLE "FinanceUnidade";

-- DropTable
DROP TABLE "FinanceEmpreendimento";
