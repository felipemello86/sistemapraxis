import { prisma } from "./prisma";

// Infraestrutura de observabilidade da suíte — o "sistema nervoso" que a
// arquitetura AI-first depende. Deliberadamente aqui em @praxis/core (não em
// @praxis/ai-engine) porque isso é infraestrutura, não inteligência: os
// pontos de chamada mais valiosos (createCorrectionCardForItem,
// resolveCorrectionCard, aplicarBloqueioPorUrgencia — ver
// maintenanceCorrection.ts/maintenanceUrgente.ts) já vivem neste pacote, e
// core nunca deve depender de ai-engine (a dependência é sempre no sentido
// contrário: ai-engine lê o que core grava). Assim, qualquer novo módulo que
// escreva nessas funções compartilhadas passa a ser observável pela IA sem
// precisar lembrar de instrumentar nada — a emissão de evento é parte do
// próprio fluxo de negócio, não um passo extra que alguém pode esquecer.
//
// packages/ai-engine consome esta tabela (AiEvent) pra alimentar detectores
// que precisam de histórico/tendência; detectores que só precisam do estado
// atual de uma tabela de domínio (ex.: cards em aberto) podem consultá-la
// direto, sem passar por aqui — nem todo insight depende do log de eventos.

export interface AiEventInput {
  tenantId: string;
  /** Nome do módulo de origem — texto livre (ex.: "MAINTENANCE",
   * "HOUSEKEEPING"), não o enum SuiteModule: o log precisa sobreviver a
   * eventos de sistema não amarrados a nenhum módulo de negócio. */
  module: string;
  /** Namespaced, ex.: "maintenance.correction.resolved" — convenção:
   * "<modulo>.<entidade>.<acao>". */
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown>;
}

/**
 * Registra um evento operacional bruto. Best-effort e nunca lança — mesmo
 * princípio do envio de push em notify.ts: uma falha aqui (ex.: uma
 * migração pendente em produção) não pode derrubar o fluxo de negócio que a
 * estava chamando. Chamar sempre ao lado da ação real já confirmada (depois
 * do write de domínio), nunca antes.
 */
export async function emitEvent(input: AiEventInput): Promise<void> {
  try {
    await prisma.aiEvent.create({
      data: {
        tenantId: input.tenantId,
        module: input.module,
        eventType: input.eventType,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        payload: JSON.stringify(input.payload ?? {}),
      },
    });
  } catch (e) {
    console.error(`[ai-events] falha ao registrar evento "${input.eventType}"`, e);
  }
}
