import { prisma } from "@praxis/core";
import type { AiDetector, InsightDraft } from "../types";

// Detector genérico que avalia as regras criadas por chat (AiCustomRule,
// active=true) contra o snapshot CORE de cada UH (ver metrics.ts). Não é um
// sistema paralelo: entra no mesmo registry, mesma dedupeKey, mesmo
// narrador, mesma Central de Inteligência — a única diferença é que a
// "lógica" de cada regra é dado (uma linha na tabela), não código.

const OPERADORES: Record<string, (valor: number, limiar: number) => boolean> = {
  GT: (v, l) => v > l,
  GTE: (v, l) => v >= l,
  LT: (v, l) => v < l,
  LTE: (v, l) => v <= l,
  EQ: (v, l) => v === l,
};

const DETECTOR_ID = "custom.regras-usuario";

export const customRulesDetector: AiDetector = {
  id: DETECTOR_ID,
  module: "CUSTOM",
  label: "Regras criadas pelos usuários via chat",

  async run(ctx): Promise<InsightDraft[]> {
    const regras = await prisma.aiCustomRule.findMany({ where: { tenantId: ctx.tenantId, active: true } });
    if (regras.length === 0) return [];

    const snapshots = await prisma.aiEntitySnapshot.findMany({
      where: { tenantId: ctx.tenantId, module: "CORE", entityType: "UH" },
    });
    if (snapshots.length === 0) return [];

    const uhs = await prisma.uH.findMany({
      where: { id: { in: snapshots.map((s) => s.entityId) } },
      select: { id: true, numero: true },
    });
    const numeroPorUh = new Map(uhs.map((u) => [u.id, u.numero]));

    const drafts: InsightDraft[] = [];

    for (const regra of regras) {
      const comparar = OPERADORES[regra.operator];
      if (!comparar) continue;

      for (const snap of snapshots) {
        let metrics: Record<string, unknown>;
        try {
          metrics = JSON.parse(snap.metrics);
        } catch {
          continue;
        }
        const valor = metrics[regra.metricKey];
        if (typeof valor !== "number") continue;
        if (!comparar(valor, regra.threshold)) continue;

        const uhNumero = numeroPorUh.get(snap.entityId) ?? snap.entityId;
        const explicacao = regra.explanation
          .replaceAll("{{uh}}", uhNumero)
          .replaceAll("{{valor}}", String(valor));

        drafts.push({
          dedupeKey: `${DETECTOR_ID}:${regra.id}:${snap.entityId}`,
          module: regra.module,
          entityType: "UH",
          entityId: snap.entityId,
          priority: regra.priority,
          title: `${regra.label} — Unidade ${uhNumero}`,
          explanation: explicacao,
          evidence: [
            { label: "Unidade", value: uhNumero },
            { label: "Métrica", value: regra.metricKey },
            { label: "Valor atual", value: valor },
            { label: "Limiar da regra", value: regra.threshold },
            { label: "Regra criada por", value: regra.createdById },
          ],
          // Regra determinística sobre dado real, mesma confiança fixa dos
          // outros detectores de limiar (ver comentário em
          // manutencao-nc-urgente-parada.ts).
          confidence: 0.9,
          recommendedAction: regra.recommendedAction,
        });
      }
    }

    return drafts;
  },
};
