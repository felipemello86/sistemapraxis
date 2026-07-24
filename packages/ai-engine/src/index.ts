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
//   7. Métricas (metrics.ts): catálogo fixo de métricas por UH + o cálculo
//      delas (computeCoreMetrics, chamado no início de
//      runDetectorsForTenant) — a base sobre a qual regras customizadas e
//      o chat operam, sem depender de reimplementar consultas.
//
//   8. Regras customizadas (detectors/custom-rules.ts): AiCustomRule
//      criada por chat (ver item 9), avaliada pelo mesmo pipeline de
//      qualquer detector — não é um sistema paralelo.
//
//   9. Chat (chat/*): loop de tool-use sobre ferramentas de LEITURA
//      tenant-escopadas (métricas, insights, NCs, falhas pendentes) + uma
//      única ferramenta de escrita (propor_regra) que só cria rascunhos
//      inativos — confirmação de regra é sempre uma ação humana explícita
//      pela UI, nunca automática.
//
//   10. UI (fora deste pacote): apps/gateway/src/app/[cliente]/inteligencia
//       — feed da Central de Inteligência, chat e gestão de regras.

export * from "./types";
export * from "./memory";
export * from "./insights";
export * from "./narrator";
export * from "./registry";
export * from "./metrics";
export { detectors } from "./detectors";
export * from "./chat/tools";
export * from "./chat/runChat";
