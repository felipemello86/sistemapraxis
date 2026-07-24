import { prisma } from "@praxis/core";
import { upsertEntitySnapshot } from "./memory";

// Catálogo fixo de métricas conhecidas, por UH — a base sobre a qual tanto
// as regras customizadas (AiCustomRule) quanto as ferramentas do chat
// operam. Fixo de propósito: nem o chat nem uma regra customizada podem
// referenciar uma métrica que não esteja aqui, o que impede o modelo de
// "inventar" um dado que o sistema não sabe calcular (mesma garantia
// estrutural de "nunca invente dados" dos detectores comuns, ver
// types.ts). Adicionar uma métrica nova é: (1) computá-la em
// computeCoreMetrics, (2) adicionar a entrada aqui — nada mais precisa
// mudar pro chat e pras regras já conseguirem usá-la.

export interface MetricDefinition {
  key: string;
  label: string;
  unit: string;
  module: string;
}

export const METRIC_CATALOG: MetricDefinition[] = [
  { key: "maintenance.nc_urgentes_abertas", label: "NCs urgentes abertas", unit: "NCs", module: "MAINTENANCE" },
  { key: "maintenance.nc_abertas", label: "NCs abertas (qualquer prioridade)", unit: "NCs", module: "MAINTENANCE" },
  {
    key: "maintenance.correcoes_recorrentes_max",
    label: "Máximo de correções repetidas no mesmo item nos últimos 60 dias",
    unit: "correções",
    module: "MAINTENANCE",
  },
  {
    key: "maintenance.dias_desde_ultima_inspecao",
    label: "Dias desde a última inspeção de Manutenção",
    unit: "dias",
    module: "MAINTENANCE",
  },
  {
    key: "housekeeping.falhas_gerenciais_pendentes",
    label: "Falhas Gerenciais pendentes",
    unit: "falhas",
    module: "HOUSEKEEPING",
  },
];

const METRIC_KEYS = new Set(METRIC_CATALOG.map((m) => m.key));

export function isMetricaValida(key: string): boolean {
  return METRIC_KEYS.has(key);
}

const JANELA_RECORRENCIA_DIAS = 60;

/**
 * Recalcula o snapshot "CORE" (module="CORE", entityType="UH") de cada UH
 * ativa do tenant — a base que o customRulesDetector e as ferramentas de
 * chat consultam. Chamado no início de runDetectorsForTenant (ver
 * registry.ts), então roda a cada passada do cron, sempre com dado fresco.
 * Consultas agregadas (groupBy) em vez de uma por UH — o custo é O(métricas),
 * não O(UHs × métricas).
 */
export async function computeCoreMetrics(tenantId: string): Promise<void> {
  const uhs = await prisma.uH.findMany({ where: { tenantId, ativo: true }, select: { id: true } });
  if (uhs.length === 0) return;

  const porUh = new Map<string, Record<string, number>>();
  const garantirEntrada = (uhId: string) => {
    if (!porUh.has(uhId)) porUh.set(uhId, {});
    return porUh.get(uhId)!;
  };
  for (const uh of uhs) garantirEntrada(uh.id);

  const [ncUrgentes, ncAbertas, correcoesRecorrencia, ultimaInspecao, falhasPendentes] = await Promise.all([
    prisma.maintenanceCorrectionCard.groupBy({
      by: ["uhId"],
      where: {
        tenantId,
        executionStatus: { not: "EXECUTADA" },
        externalServiceStatus: { not: "EXECUTADO" },
        inspectionItem: { status: "NAO_CONFORME", urgente: true },
      },
      _count: { _all: true },
    }),
    prisma.maintenanceCorrectionCard.groupBy({
      by: ["uhId"],
      where: {
        tenantId,
        executionStatus: { not: "EXECUTADA" },
        externalServiceStatus: { not: "EXECUTADO" },
        inspectionItem: { status: "NAO_CONFORME" },
      },
      _count: { _all: true },
    }),
    prisma.maintenanceCorrection.groupBy({
      by: ["uhId", "checklistItemId"],
      where: {
        tenantId,
        checklistItemId: { not: null },
        createdAt: { gte: new Date(Date.now() - JANELA_RECORRENCIA_DIAS * 24 * 60 * 60 * 1000) },
      },
      _count: { _all: true },
    }),
    prisma.maintenanceInspection.groupBy({
      by: ["uhId"],
      where: { tenantId },
      _max: { date: true },
    }),
    prisma.hkManagerialFailureCard.groupBy({
      by: ["uhId"],
      where: { tenantId, status: "PENDENTE" },
      _count: { _all: true },
    }),
  ]);

  const now = Date.now();

  for (const row of ncUrgentes) {
    garantirEntrada(row.uhId)["maintenance.nc_urgentes_abertas"] = row._count._all;
  }
  for (const row of ncAbertas) {
    garantirEntrada(row.uhId)["maintenance.nc_abertas"] = row._count._all;
  }
  for (const row of correcoesRecorrencia) {
    const entrada = garantirEntrada(row.uhId);
    const atual = entrada["maintenance.correcoes_recorrentes_max"] ?? 0;
    if (row._count._all > atual) entrada["maintenance.correcoes_recorrentes_max"] = row._count._all;
  }
  for (const row of ultimaInspecao) {
    if (!row._max.date) continue;
    const dias = Math.floor((now - row._max.date.getTime()) / (24 * 60 * 60 * 1000));
    garantirEntrada(row.uhId)["maintenance.dias_desde_ultima_inspecao"] = dias;
  }
  for (const row of falhasPendentes) {
    garantirEntrada(row.uhId)["housekeeping.falhas_gerenciais_pendentes"] = row._count._all;
  }

  for (const [uhId, metrics] of porUh.entries()) {
    // Preenche com 0 as métricas do catálogo que não apareceram pra essa UH
    // (ex.: nenhuma NC aberta) — sem isso, uma regra "NCs abertas > 0" nunca
    // dispararia corretamente pra "voltou a zero" porque a chave simplesmente
    // não existiria no JSON.
    for (const def of METRIC_CATALOG) {
      if (!(def.key in metrics)) metrics[def.key] = 0;
    }
    await upsertEntitySnapshot({ tenantId, module: "CORE", entityType: "UH", entityId: uhId, metrics });
  }
}
