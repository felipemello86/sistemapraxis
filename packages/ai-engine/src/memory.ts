import { prisma } from "@praxis/core";

// Memória operacional derivada — segunda camada de memória do AI Engine
// (a primeira é o log bruto em AiEvent, ver @praxis/core/aiEvents.ts).
// Métricas já calculadas e agregadas por entidade (ex.: por UH), pra um
// detector não precisar reprocessar o histórico inteiro a cada rodada do
// cron. Deliberadamente números/strings simples em JSON — nunca prosa —
// pra continuar auditável (qualquer detector pode explicar de onde tirou um
// dado só olhando este registro).

export async function upsertEntitySnapshot(params: {
  tenantId: string;
  module: string;
  entityType: string;
  entityId: string;
  metrics: Record<string, unknown>;
}): Promise<void> {
  const metricsJson = JSON.stringify(params.metrics);
  await prisma.aiEntitySnapshot.upsert({
    where: {
      tenantId_module_entityType_entityId: {
        tenantId: params.tenantId,
        module: params.module,
        entityType: params.entityType,
        entityId: params.entityId,
      },
    },
    create: {
      tenantId: params.tenantId,
      module: params.module,
      entityType: params.entityType,
      entityId: params.entityId,
      metrics: metricsJson,
    },
    update: { metrics: metricsJson },
  });
}

export async function getEntitySnapshot(params: {
  tenantId: string;
  module: string;
  entityType: string;
  entityId: string;
}): Promise<Record<string, unknown> | null> {
  const row = await prisma.aiEntitySnapshot.findUnique({
    where: {
      tenantId_module_entityType_entityId: {
        tenantId: params.tenantId,
        module: params.module,
        entityType: params.entityType,
        entityId: params.entityId,
      },
    },
  });
  if (!row) return null;
  try {
    return JSON.parse(row.metrics) as Record<string, unknown>;
  } catch {
    return null;
  }
}
