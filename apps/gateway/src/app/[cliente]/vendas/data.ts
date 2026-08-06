import { prisma } from "@praxis/core";
import { normalizarTelefone } from "../../admin/crm/telefone";

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

// Mesma lógica de encontrarOuCriarLeadPorTelefone do CRM do admin (ver
// ../../admin/crm/data.ts), só que escopada por tenant — casa o número de
// quem manda mensagem (webhook) com um VendasLead já existente DESSE
// tenant, ou cria um novo com fonte "WhatsApp".
export async function encontrarOuCriarVendasLeadPorTelefone(
  tenantId: string,
  telefoneDigits: string,
  nomeContato?: string
): Promise<{ id: string }> {
  const candidatos = await prisma.vendasLead.findMany({
    where: { tenantId, telefone: { not: "" } },
    select: { id: true, telefone: true },
  });
  const existente = candidatos.find((l) => normalizarTelefone(l.telefone) === telefoneDigits);
  if (existente) return { id: existente.id };

  await garantirEtapasVendasPadrao(tenantId);
  const primeiraEtapa = await prisma.vendasEtapa.findFirst({ where: { tenantId }, orderBy: { ordem: "asc" } });

  const novo = await prisma.vendasLead.create({
    data: {
      tenantId,
      nome: nomeContato || "Contato WhatsApp",
      telefone: telefoneDigits,
      fonte: "WhatsApp",
      stageId: primeiraEtapa?.id,
    },
  });

  return { id: novo.id };
}
