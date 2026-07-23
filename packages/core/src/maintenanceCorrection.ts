import { prisma } from "./prisma";
import { reavaliarBloqueioUrgencia } from "./maintenanceUrgente";

// Fluxo de Correção (Aquisição / Serviços Externos / Execução) — substitui a
// antiga Rota de Correção de passo único. Compartilhado em @praxis/core (em
// vez de duplicado por app) porque os 4 pontos que criam uma não
// conformidade vivem em DOIS apps diferentes (apps/maintenance: inspeção e
// UH 3D; apps/housekeeping: relato rápido de camareira e de governanta),
// mas todos escrevem nas mesmas tabelas do schema suite_core.

/**
 * Cria o card de Correção pra uma não conformidade recém-registrada. Chamado
 * a partir de qualquer um dos pontos de entrada que criam/atualizam um
 * MaintenanceInspectionItem pra NAO_CONFORME.
 *
 * needsMaterial/needsExternalService podem vir nulos (não-triado) — pedido
 * explícito do Felipe: quando o registro vem do módulo Governança (camareira
 * arrumando, governanta inspecionando, ou a flag de manutenção da tela
 * Seleção e Liberação), não cabe a essas pessoas decidir isso. O card nasce
 * sem triagem e aparece na coluna "A Processar" do kanban Execução (ver
 * kanbansDoCard abaixo, que trata null como "sem kanban" — exatamente o
 * critério usado pra popular "A Processar") — cabe ao perfil Manutenção
 * classificar de lá. Os 2 pontos de entrada do próprio módulo Manutenção
 * (inspeção completa, spot UH 3D) continuam perguntando e passando booleans
 * de verdade, então nascem já triados como sempre.
 */
export async function createCorrectionCardForItem(params: {
  tenantId: string;
  inspectionItemId: string;
  uhId: string;
  checklistItemId: string | null;
  needsMaterial: boolean | null;
  needsExternalService: boolean | null;
  triagedById: string | null;
}) {
  const jaTriado = params.needsMaterial !== null && params.needsExternalService !== null;
  return prisma.maintenanceCorrectionCard.create({
    data: {
      tenantId: params.tenantId,
      inspectionItemId: params.inspectionItemId,
      uhId: params.uhId,
      checklistItemId: params.checklistItemId,
      needsMaterial: params.needsMaterial,
      needsExternalService: params.needsExternalService,
      triagedAt: jaTriado ? new Date() : null,
      triagedById: jaTriado ? params.triagedById : null,
    },
  });
}

/**
 * Resolve definitivamente uma não conformidade a partir do seu card de
 * Correção — usado tanto pelo passo "Executado" do Kanban de Serviços
 * Externos quanto pelo passo "Executadas" do Kanban de Execução (pedido
 * explícito nos dois fluxos: "ao chegar em Executado(a), o IV volta a
 * Conforme automaticamente"). Grava o histórico em MaintenanceCorrection —
 * mesma tabela que a Rota de Correção original usava — pra não quebrar a
 * integração já existente com Informações/Visão Gerencial, além de marcar
 * os campos "executado" no próprio card (usados pelo relatório da tela
 * Performance, que precisa da hora de execução de cada card).
 */
export async function resolveCorrectionCard(params: {
  cardId: string;
  tenantId: string;
  description: string;
  photos: string[];
  authorId: string | null;
}) {
  const card = await prisma.maintenanceCorrectionCard.findUniqueOrThrow({
    where: { id: params.cardId },
    include: { inspectionItem: { select: { urgente: true } } },
  });

  const now = new Date();
  const photosJson = JSON.stringify(params.photos);

  await prisma.$transaction([
    prisma.maintenanceInspectionItem.update({
      where: { id: card.inspectionItemId },
      data: { status: "CONFORME", corrigidoEm: now, urgente: false },
    }),
    prisma.maintenanceCorrection.create({
      data: {
        tenantId: params.tenantId,
        inspectionItemId: card.inspectionItemId,
        uhId: card.uhId,
        checklistItemId: card.checklistItemId,
        authorId: params.authorId,
        description: params.description,
        photos: photosJson,
      },
    }),
    prisma.maintenanceCorrectionCard.update({
      where: { id: params.cardId },
      data: {
        executedDescription: params.description,
        executedPhotos: photosJson,
        executedAt: now,
        executedById: params.authorId,
      },
    }),
  ]);

  // Resolvido pelos kanbans (Serviços Externos "Executado" ou Execução
  // "Executadas") — se essa NC era urgente, reavalia se dá pra desbloquear
  // a UH automaticamente (só desbloqueia se não sobrar outra NC urgente
  // aberta e o bloqueio foi originado por NC urgente, ver
  // reavaliarBloqueioUrgencia).
  if (card.inspectionItem.urgente) {
    await reavaliarBloqueioUrgencia({ tenantId: params.tenantId, uhId: card.uhId });
  }
}

/**
 * Kanbans em que um card aparece — pode ser MAIS DE UM ao mesmo tempo
 * (pedido explícito: card com material E serviço externo aparece em
 * "aquisicao" E em "servicos" simultaneamente, cada frente avançando
 * independente; só some de "aquisicao" quando materialStatus vira
 * COMPRADO). "execucao" é só pra quem não precisa de serviço externo (nada,
 * ou só material — mesmo que ainda não comprado, pra aparecer desde já
 * fechando programação; a UI de Execução decide se bloqueia por material
 * pendente).
 *
 * Cards com needsMaterial/needsExternalService nulos (não-triados — dado
 * legado de antes da triagem existir, OU qualquer card criado pelo módulo
 * Governança, que nunca pergunta isso, ver createCorrectionCardForItem)
 * não aparecem em nenhum kanban normal — aparecem só na coluna "A
 * Processar" (ver kanban-execucao.tsx), de onde o perfil Manutenção
 * triagem antes de seguir pro fluxo normal.
 */
export type CorrectionKanban = "aquisicao" | "servicos" | "execucao";

export function kanbansDoCard(card: {
  needsMaterial: boolean | null;
  needsExternalService: boolean | null;
  materialStatus: string;
}): CorrectionKanban[] {
  if (card.needsMaterial === null || card.needsExternalService === null) return [];

  const kanbans: CorrectionKanban[] = [];
  if (card.needsMaterial && card.materialStatus !== "COMPRADO") kanbans.push("aquisicao");
  if (card.needsExternalService) kanbans.push("servicos");
  if (!card.needsExternalService) kanbans.push("execucao");
  return kanbans;
}

/**
 * Gate pro card avançar pra coluna "Agendado" no Kanban de Serviços
 * Externos — só pode agendar depois que o material (se precisar) já foi
 * comprado (pedido explícito: "só vai conseguir avançar pra Agendado se o
 * material já tiver sido adquirido").
 */
export function podeAgendarServico(card: { needsMaterial: boolean | null; materialStatus: string }): boolean {
  return !card.needsMaterial || card.materialStatus === "COMPRADO";
}
