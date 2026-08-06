-- Anexos no card "Novo lançamento" da tela de Conciliações (pedido do
-- Felipe, 06/08/2026) — mesmo padrão de ComplaintOcorrencia.anexos: JSON
-- array de { url, fileName, fileSize } guardado como string, sem tabela
-- própria.

ALTER TABLE "FinanceLancamento" ADD COLUMN "anexos" TEXT NOT NULL DEFAULT '[]';
