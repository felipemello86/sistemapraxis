-- Pedido do Felipe, 07/08/2026: "Em Contas conectadas, crie 'apelidos' para
-- cada conta e cartão. Esses apelidos é q devem ser exibidos em todas as
-- telas de uso do sistema" — apelido opcional (null = usa o nome original
-- vindo da Pluggy). Ver FinanceContaBancaria.apelido em schema.prisma.
ALTER TABLE "FinanceContaBancaria" ADD COLUMN "apelido" TEXT;
