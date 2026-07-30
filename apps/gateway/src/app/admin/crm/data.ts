import { prisma } from "@praxis/core";
import { normalizarTelefone } from "./telefone";

// CRM (Fase 1, 30/07/2026) — helpers de dados compartilhados entre
// /admin/crm, /admin/crm/[leadId] e /admin/crm/etapas, e também o endpoint
// público POST /api/demo (que cria o lead já na 1ª etapa).

// Etapas padrão criadas na primeira carga de /admin/crm (ou no primeiro
// POST /api/demo, o que vier antes), caso a tabela PipelineStage esteja
// vazia. Self-heal deliberado: evita um passo manual de seed separado da
// migration — mesmo tipo de passo manual esquecido que já causou um outage
// nesta suíte (28/07/2026, migration da Manutenção). Idempotente: só cria
// se count === 0.
// Ganho/Perdido não são mais etapas (30/07/2026) — viraram um desfecho
// independente (DemoLead.desfecho), marcável em qualquer uma destas.
const ETAPAS_PADRAO = ["Novo", "Contatado", "Agendado", "Apresentado", "Em Negociação"];

export async function garantirEtapasPadrao(): Promise<void> {
  const total = await prisma.pipelineStage.count();
  if (total > 0) return;
  await prisma.pipelineStage.createMany({
    data: ETAPAS_PADRAO.map((nome, i) => ({ nome, ordem: i })),
  });
}

// Backfill de leads criados antes do CRM existir (stageId nulo, coluna
// adicionada pela migration crm_pipeline_leads): joga pra 1ª etapa do funil
// (menor "ordem", tipicamente "Novo"). Leads legados já marcados como
// atendido=true vão pra 2ª etapa em vez da 1ª, pra não misturar "nunca
// visto" com "já teve contato" logo na primeira carga do board.
export async function backfillLeadsSemEtapa(): Promise<void> {
  const semEtapa = await prisma.demoLead.findMany({
    where: { stageId: null },
    select: { id: true, atendido: true },
  });
  if (semEtapa.length === 0) return;

  const etapas = await prisma.pipelineStage.findMany({ orderBy: { ordem: "asc" } });
  if (etapas.length === 0) return;
  const primeira = etapas[0];
  const segunda = etapas[1] ?? primeira;

  await Promise.all(
    semEtapa.map((l) =>
      prisma.demoLead.update({
        where: { id: l.id },
        data: { stageId: l.atendido ? segunda.id : primeira.id },
      })
    )
  );
}

// Chamado no topo de /admin/crm e /admin/crm/etapas — garante que sempre há
// etapas e que nenhum lead fica "invisível" (sem coluna) por falta de
// stageId. Barato o suficiente pra rodar em toda carga (early-return na
// grande maioria das vezes, depois do primeiro backfill).
export async function garantirCrmPronto(): Promise<void> {
  await garantirEtapasPadrao();
  await backfillLeadsSemEtapa();
}

// CRM Fase 2 (30/07/2026) — casa o número de quem manda mensagem no
// WhatsApp (webhook da Meta, dígitos puros com DDI) com um DemoLead já
// existente, comparando por normalizarTelefone (ver ./telefone.ts) — assim
// um lead cadastrado como "(81) 98952-6361" bate com o "5581989526361" que
// chega no webhook. Volume baixo (dezenas de leads/mês) então comparar tudo
// em memória é suficiente; não vale a complexidade de manter uma coluna
// normalizada indexada só por causa disso. Se ninguém bater, cria um lead
// novo com fonte "WhatsApp" — mensagem espontânea de alguém que ainda não
// existia no funil.
export async function encontrarOuCriarLeadPorTelefone(
  telefoneDigits: string,
  nomeContato?: string
): Promise<{ id: string }> {
  const candidatos = await prisma.demoLead.findMany({
    where: { telefone: { not: "" } },
    select: { id: true, telefone: true },
  });
  const existente = candidatos.find((l) => normalizarTelefone(l.telefone) === telefoneDigits);
  if (existente) return { id: existente.id };

  await garantirEtapasPadrao();
  const primeiraEtapa = await prisma.pipelineStage.findFirst({ orderBy: { ordem: "asc" } });

  const novo = await prisma.demoLead.create({
    data: {
      nome: nomeContato?.trim() || "Contato WhatsApp",
      hotel: "A identificar",
      email: "",
      telefone: telefoneDigits,
      fonte: "WhatsApp",
      stageId: primeiraEtapa?.id,
    },
  });
  return { id: novo.id };
}
