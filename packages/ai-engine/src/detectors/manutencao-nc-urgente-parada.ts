import { prisma } from "@praxis/core";
import type { AiDetector, InsightDraft } from "../types";

// Detector: NC urgente (impeditiva ao uso) parada há mais de LIMIAR_HORAS
// sem ser resolvida — regra determinística, sem LLM. A confiança aqui é
// alta e fixa (0.95): não é uma inferência estatística, é a leitura direta
// de um fato do banco (o card existe, está aberto, é urgente e está velho).
// Prioridade sobe de ALTA pra CRITICA a partir do dobro do limiar.

const LIMIAR_HORAS = 24;
const HORAS_PARA_CRITICA = 72;
const DETECTOR_ID = "manutencao.nc-urgente-parada";
const MODULO = "MAINTENANCE";

export const ncUrgenteParadaDetector: AiDetector = {
  id: DETECTOR_ID,
  module: MODULO,
  label: "NC urgente parada sem resolução",

  async run(ctx): Promise<InsightDraft[]> {
    const limite = new Date(ctx.now.getTime() - LIMIAR_HORAS * 60 * 60 * 1000);

    const cards = await prisma.maintenanceCorrectionCard.findMany({
      where: {
        tenantId: ctx.tenantId,
        executionStatus: { not: "EXECUTADA" },
        externalServiceStatus: { not: "EXECUTADO" },
        createdAt: { lt: limite },
        inspectionItem: { status: "NAO_CONFORME", urgente: true },
      },
      include: {
        uh: { select: { numero: true } },
        checklistItem: { select: { name: true } },
        inspectionItem: { select: { comment: true } },
      },
    });

    return cards.map((card) => {
      const horasAbertas = Math.floor((ctx.now.getTime() - card.createdAt.getTime()) / (60 * 60 * 1000));
      return {
        dedupeKey: `${DETECTOR_ID}:${card.id}`,
        module: MODULO,
        entityType: "UH",
        entityId: card.uhId,
        priority: horasAbertas >= HORAS_PARA_CRITICA ? "CRITICA" : "ALTA",
        title: `NC urgente parada há ${horasAbertas}h — Unidade ${card.uh.numero}`,
        explanation:
          `A não conformidade urgente em ${card.checklistItem?.name ?? "item removido do catálogo"} ` +
          `(Unidade ${card.uh.numero}) está aberta há ${horasAbertas} horas sem execução, comprometendo o uso da UH.`,
        evidence: [
          { label: "Unidade", value: card.uh.numero },
          { label: "Item", value: card.checklistItem?.name ?? "—" },
          { label: "Horas em aberto", value: horasAbertas },
          { label: "Descrição da NC", value: card.inspectionItem.comment ?? "—" },
        ],
        confidence: 0.95,
        recommendedAction:
          "Priorizar a execução (ou a contratação do serviço externo, se for o caso) ainda hoje — " +
          "NC urgente impede o uso normal da UH enquanto seguir em aberto.",
      };
    });
  },
};
