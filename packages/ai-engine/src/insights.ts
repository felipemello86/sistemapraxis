import { prisma } from "@praxis/core";
import type { InsightDraft } from "./types";

// Grava (ou atualiza) um InsightDraft já calculado por um detector. A
// dedupeKey é o mecanismo central anti-spam: o cron roda a cada poucos
// minutos, então sem dedup o mesmo problema em aberto viraria um insight
// novo a cada rodada. Regra:
//   - Não existe ainda -> cria ABERTO.
//   - Existe e está ABERTO/LIDO (condição ainda em aberto) -> atualiza os
//     fatos no lugar (evidence/confidence/prioridade podem ter mudado),
//     preserva o status de leitura, bumpa lastSeenAt.
//   - Existe mas já foi RESOLVIDO/DESCARTADO -> a condição reapareceu depois
//     de encerrada, então é tratada como um alerta novo de verdade: reabre
//     como ABERTO.

export async function upsertInsight(tenantId: string, detectorId: string, draft: InsightDraft): Promise<void> {
  const existente = await prisma.aiInsight.findUnique({
    where: { tenantId_dedupeKey: { tenantId, dedupeKey: draft.dedupeKey } },
  });

  const dadosAtuais = {
    detectorId,
    module: draft.module,
    entityType: draft.entityType ?? null,
    entityId: draft.entityId ?? null,
    priority: draft.priority,
    title: draft.title,
    explanation: draft.explanation,
    evidence: JSON.stringify(draft.evidence),
    confidence: draft.confidence,
    recommendedAction: draft.recommendedAction,
    eventIds: JSON.stringify(draft.eventIds ?? []),
    lastSeenAt: new Date(),
  };

  if (!existente) {
    await prisma.aiInsight.create({
      data: { tenantId, dedupeKey: draft.dedupeKey, status: "ABERTO", ...dadosAtuais },
    });
    return;
  }

  if (existente.status === "RESOLVIDO" || existente.status === "DESCARTADO") {
    await prisma.aiInsight.update({
      where: { id: existente.id },
      data: { ...dadosAtuais, status: "ABERTO", resolvedAt: null, resolvedById: null },
    });
    return;
  }

  await prisma.aiInsight.update({ where: { id: existente.id }, data: dadosAtuais });
}
