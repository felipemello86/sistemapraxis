import { prisma } from "@praxis/core";

// Mesmas etapas padrão do CRM do admin (ver ../../admin/crm/data.ts) — só
// que criadas por tenant, na primeira carga de /:cliente/vendas de cada
// hotel. Self-heal idempotente (só cria se esse tenant ainda não tem
// nenhuma etapa), mesmo padrão de garantirEtapasPadrao.
const ETAPAS_PADRAO = ["Novo", "Contatado", "Em Negociação", "Fechado"];

export async function garantirEtapasVendasPadrao(tenantId: string): Promise<void> {
  const total = await prisma.vendasEtapa.count({ where: { tenantId } });
  if (total > 0) return;
  await prisma.vendasEtapa.createMany({
    data: ETAPAS_PADRAO.map((nome, i) => ({ tenantId, nome, ordem: i })),
  });
}
