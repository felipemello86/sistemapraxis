import type { DetectorContext } from "./types";
import { upsertInsight } from "./insights";
import { narrarInsight } from "./narrator";
import { detectors } from "./detectors";
import { computeCoreMetrics } from "./metrics";

export interface DetectorRunResult {
  detectorId: string;
  count: number;
  error?: string;
}

/**
 * Roda todos os detectores registrados pra um tenant e grava (ou atualiza)
 * os insights resultantes. Chamado pelo cron de análise (ver
 * apps/gateway/src/app/api/cron/ai-engine/route.ts) — um tenant por vez.
 *
 * Isolamento entre detectores: um detector que falha (bug, timeout de
 * query) não impede os demais de rodar — cada um roda dentro do seu próprio
 * try/catch, e o erro fica só no resultado retornado (pra log/observação),
 * nunca propaga.
 */
export async function runDetectorsForTenant(tenantId: string): Promise<DetectorRunResult[]> {
  // Sempre recalcula o snapshot CORE antes de rodar os detectores — o
  // customRulesDetector (e as ferramentas do chat) dependem de dado fresco
  // aqui. Best-effort: uma falha no cálculo de métricas não pode impedir os
  // outros detectores (que não dependem dele) de rodar.
  try {
    await computeCoreMetrics(tenantId);
  } catch (e) {
    console.error("[ai-engine] falha ao computar métricas CORE", e);
  }

  const ctx: DetectorContext = { tenantId, now: new Date() };
  const resultados: DetectorRunResult[] = [];

  for (const detector of detectors) {
    try {
      const drafts = await detector.run(ctx);
      for (const draft of drafts) {
        const narrado = await narrarInsight(draft);
        await upsertInsight(tenantId, detector.id, narrado);
      }
      resultados.push({ detectorId: detector.id, count: drafts.length });
    } catch (e) {
      console.error(`[ai-engine] detector "${detector.id}" falhou`, e);
      resultados.push({ detectorId: detector.id, count: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return resultados;
}
