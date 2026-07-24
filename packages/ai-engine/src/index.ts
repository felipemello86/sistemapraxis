// @praxis/ai-engine — camada de inteligência da suíte Praxis.
//
// Arquitetura (ver conversa/decisão de arquitetura pra contexto completo):
//
//   1. Observabilidade (infraestrutura, vive em @praxis/core/aiEvents.ts):
//      emitEvent() é chamado nos pontos de negócio que já são a fonte da
//      verdade de "algo aconteceu" (createCorrectionCardForItem,
//      resolveCorrectionCard, aplicarBloqueioPorUrgencia/
//      reavaliarBloqueioUrgencia, liberarLateCheckoutsVencidos) — escreve
//      num log append-only (AiEvent). Deliberadamente em core, não aqui:
//      core nunca depende deste pacote, a dependência é sempre no sentido
//      contrário.
//
//   2. Memória derivada (memory.ts): AiEntitySnapshot — métricas agregadas
//      por entidade, recalculadas pelos detectores conforme rodam, pra não
//      reprocessar o histórico inteiro toda vez.
//
//   3. Detectores plugáveis (detectors/*, types.ts): cada um é uma regra
//      determinística que lê AiEvent e/ou o estado atual dos módulos e
//      devolve InsightDraft[] com priority/confidence/evidence/
//      recommendedAction sempre calculados a partir de dado real. Este é o
//      contrato (AiDetector) que também serve de encaixe pros agentes
//      especializados do futuro — mesmo formato de entrada/saída, podendo
//      internamente usar LLM + tool-use em vez de uma regra simples, sem
//      que o resto do pipeline precise mudar.
//
//   4. Narrador (narrator.ts): único passo opcional de LLM — reescreve so-
//      mente o texto de `explanation`, nunca os fatos. Degrada
//      graciosamente sem ANTHROPIC_API_KEY.
//
//   5. Persistência com dedup (insights.ts): upsertInsight grava AiInsight,
//      atualizando em vez de duplicar enquanto a condição persiste.
//
//   6. Orquestração (registry.ts): runDetectorsForTenant roda tudo isso pra
//      um tenant, chamado pelo cron em apps/gateway. "Contínuo" na prática
//      quer dizer "cron frequente" — a hospedagem é 100% serverless
//      (Vercel), não há processo long-running pra rodar um stream real.
//
//   7. UI (fora deste pacote): apps/gateway/src/app/[cliente]/inteligencia
//      — feed da Central de Inteligência, lendo AiInsight direto.

export * from "./types";
export * from "./memory";
export * from "./insights";
export * from "./narrator";
export * from "./registry";
export { detectors } from "./detectors";
