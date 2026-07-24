import { prisma } from "@praxis/core";
import type { AiDetector, InsightDraft } from "../types";

// Detector: Falha Gerencial (HkManagerialFailureCard) pendente há mais de
// LIMIAR_HORAS — essas falhas exigem uma decisão humana (Gerente/Governanta,
// ver tela "Falhas Gerenciais") que não tem nenhum caminho automático de
// resolução, diferente das NCs de Manutenção. Ficar parada por dias costuma
// significar que ninguém viu, não que foi triada e decidida.

const LIMIAR_HORAS = 48;
const HORAS_PARA_CRITICA = 168; // 7 dias
const DETECTOR_ID = "housekeeping.falha-gerencial-pendente";
const MODULO = "HOUSEKEEPING";

export const falhaGerencialPendenteDetector: AiDetector = {
  id: DETECTOR_ID,
  module: MODULO,
  label: "Falha Gerencial pendente há muito tempo",

  async run(ctx): Promise<InsightDraft[]> {
    const limite = new Date(ctx.now.getTime() - LIMIAR_HORAS * 60 * 60 * 1000);

    const pendentes = await prisma.hkManagerialFailureCard.findMany({
      where: { tenantId: ctx.tenantId, status: "PENDENTE", createdAt: { lt: limite } },
      include: { uh: { select: { numero: true } } },
    });

    return pendentes.map((card) => {
      const horasAbertas = Math.floor((ctx.now.getTime() - card.createdAt.getTime()) / (60 * 60 * 1000));
      return {
        dedupeKey: `${DETECTOR_ID}:${card.id}`,
        module: MODULO,
        entityType: "UH",
        entityId: card.uhId,
        priority: horasAbertas >= HORAS_PARA_CRITICA ? "ALTA" : "MEDIA",
        title: `Falha Gerencial pendente há ${Math.floor(horasAbertas / 24)}d — Unidade ${card.uh.numero}`,
        explanation:
          `A falha "${card.itemNome}" registrada na Unidade ${card.uh.numero} está pendente de decisão ` +
          `há ${Math.floor(horasAbertas / 24)} dias, sem nenhum caminho automático de resolução.`,
        evidence: [
          { label: "Unidade", value: card.uh.numero },
          { label: "Item", value: card.itemNome },
          { label: "Descrição", value: card.descricao },
          { label: "Dias pendente", value: Math.floor(horasAbertas / 24) },
        ],
        confidence: 0.95,
        recommendedAction: "Revisar e decidir na tela Falhas Gerenciais — provável que ainda não foi vista.",
      };
    });
  },
};
