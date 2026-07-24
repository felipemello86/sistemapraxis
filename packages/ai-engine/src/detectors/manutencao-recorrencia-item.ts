import { prisma } from "@praxis/core";
import { upsertEntitySnapshot } from "../memory";
import type { AiDetector, InsightDraft } from "../types";

// Detector: mesmo item de checklist corrigido repetidas vezes na mesma UH
// numa janela de tempo — sinal de causa raiz não resolvida (ex.: "ar
// condicionado" consertado 3x em 60 dias é sintoma de troca de peça
// necessária, não de manutenção pontual). Usa MaintenanceCorrection (o
// histórico permanente de correções) como fonte, e grava um
// AiEntitySnapshot por UH com a contagem — prova de uso real da memória
// derivada, não só do log de eventos brutos.
//
// Confiança cresce com o número de recorrências: 3 ocorrências já é um
// padrão digno de nota (0.7), a partir de 5 vira quase certeza de causa raiz
// (até um teto de 0.9 — nunca 1.0, porque é sempre possível que sejam
// problemas coincidentes e não-relacionados no mesmo item).

const JANELA_DIAS = 60;
const MINIMO_OCORRENCIAS = 3;
const DETECTOR_ID = "manutencao.recorrencia-item";
const MODULO = "MAINTENANCE";

export const recorrenciaItemDetector: AiDetector = {
  id: DETECTOR_ID,
  module: MODULO,
  label: "Item com correções recorrentes na mesma UH",

  async run(ctx): Promise<InsightDraft[]> {
    const desde = new Date(ctx.now.getTime() - JANELA_DIAS * 24 * 60 * 60 * 1000);

    const correcoes = await prisma.maintenanceCorrection.findMany({
      where: { tenantId: ctx.tenantId, createdAt: { gte: desde }, checklistItemId: { not: null } },
      include: { uh: { select: { numero: true } }, checklistItem: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });

    type Grupo = {
      uhId: string;
      uhNumero: string;
      checklistItemId: string;
      itemNome: string;
      datas: Date[];
    };
    const grupos = new Map<string, Grupo>();
    for (const c of correcoes) {
      if (!c.checklistItemId) continue;
      const key = `${c.uhId}:${c.checklistItemId}`;
      const g =
        grupos.get(key) ??
        ({
          uhId: c.uhId,
          uhNumero: c.uh.numero,
          checklistItemId: c.checklistItemId,
          itemNome: c.checklistItem?.name ?? "item removido do catálogo",
          datas: [],
        } as Grupo);
      g.datas.push(c.createdAt);
      grupos.set(key, g);
    }

    const drafts: InsightDraft[] = [];
    for (const g of grupos.values()) {
      // Memória derivada: grava a contagem por UH mesmo pros grupos abaixo
      // do limiar de insight — outro detector (ou uma versão futura deste)
      // pode consultar sem reprocessar o MaintenanceCorrection inteiro.
      await upsertEntitySnapshot({
        tenantId: ctx.tenantId,
        module: MODULO,
        entityType: "UH",
        entityId: g.uhId,
        metrics: { [`recorrencia:${g.checklistItemId}`]: g.datas.length },
      });

      if (g.datas.length < MINIMO_OCORRENCIAS) continue;

      const confidence = Math.min(0.9, 0.5 + g.datas.length * 0.1);
      const primeiraData = g.datas[0];
      const ultimaData = g.datas[g.datas.length - 1];

      drafts.push({
        dedupeKey: `${DETECTOR_ID}:${g.uhId}:${g.checklistItemId}`,
        module: MODULO,
        entityType: "UH",
        entityId: g.uhId,
        priority: g.datas.length >= 5 ? "ALTA" : "MEDIA",
        title: `${g.itemNome} corrigido ${g.datas.length}x em ${JANELA_DIAS} dias — Unidade ${g.uhNumero}`,
        explanation:
          `A Unidade ${g.uhNumero} teve "${g.itemNome}" corrigido ${g.datas.length} vezes nos últimos ` +
          `${JANELA_DIAS} dias — padrão de recorrência que sugere causa raiz não resolvida, não desgaste pontual.`,
        evidence: [
          { label: "Unidade", value: g.uhNumero },
          { label: "Item", value: g.itemNome },
          { label: "Correções na janela", value: g.datas.length },
          { label: "Janela analisada (dias)", value: JANELA_DIAS },
          { label: "Primeira correção", value: primeiraData.toISOString().slice(0, 10) },
          { label: "Última correção", value: ultimaData.toISOString().slice(0, 10) },
        ],
        confidence,
        recommendedAction:
          "Investigar causa raiz (peça/instalação, não só sintoma) antes da próxima ocorrência — " +
          "considerar troca completa em vez de mais um reparo pontual.",
      });
    }

    return drafts;
  },
};
