import type { AiInsightPriority } from "@praxis/core";

// Tipos centrais do AI Engine. Ver README no topo de index.ts pra visão
// geral (memória derivada -> detectores -> insights -> Central de
// Inteligência).

/** Um item de evidência concreta que sustenta um insight — sempre
 * rastreável a um dado real (uma contagem, uma data, um id), nunca uma
 * afirmação solta. É isso que torna "nunca invente dados" uma restrição de
 * arquitetura, não só uma instrução de prompt. */
export interface AiEvidenceItem {
  label: string;
  value: string | number;
  eventId?: string;
}

/**
 * O que um detector produz. priority/confidence/evidence/recommendedAction
 * são SEMPRE calculados pelo detector a partir de dados reais — nunca
 * preenchidos por um LLM (ver narrator.ts: o único passo de LLM do pipeline
 * reescreve apenas `explanation`, e mesmo assim só a partir dos fatos que já
 * estão em `evidence`).
 */
export interface InsightDraft {
  /** Estável — a mesma condição persistindo deve gerar o mesmo dedupeKey,
   * pra runDetectorsForTenant atualizar o insight existente em vez de
   * duplicar a cada rodada do cron. Convenção: "<detectorId>:<entityId>". */
  dedupeKey: string;
  module: string;
  entityType?: string | null;
  entityId?: string | null;
  priority: AiInsightPriority;
  title: string;
  explanation: string;
  evidence: AiEvidenceItem[];
  /** 0..1 — calculado deterministicamente (tamanho de amostra, recência,
   * força do sinal estatístico), nunca "achado". */
  confidence: number;
  recommendedAction: string;
  /** Ids de AiEvent que embasaram este insight, quando o detector partiu do
   * log de eventos (nem todos partem — alguns leem estado/histórico já
   * durável do próprio módulo, o que é igualmente válido). */
  eventIds?: string[];
}

export interface DetectorContext {
  tenantId: string;
  now: Date;
}

/**
 * O contrato que qualquer detector precisa cumprir pra entrar no registry
 * (ver registry.ts). Esse é o ponto de baixo acoplamento que prepara o
 * terreno pros "agentes especializados" do futuro: hoje todo detector aqui é
 * uma regra determinística (limiar, recorrência, tendência); amanhã, um
 * agente com LLM + tool-use pode ser só mais um item deste array, desde que
 * devolva o mesmo InsightDraft[] — nem o storage nem a Central de
 * Inteligência precisam saber a diferença.
 */
export interface AiDetector {
  id: string;
  module: string;
  label: string;
  run(ctx: DetectorContext): Promise<InsightDraft[]>;
}
