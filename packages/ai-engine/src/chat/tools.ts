import { prisma } from "@praxis/core";
import { METRIC_CATALOG, isMetricaValida } from "../metrics";

// Ferramentas do chat — SEMPRE escopadas por tenantId injetado pelo
// servidor (nunca fornecido pelo modelo), o mesmo princípio de isolamento
// multi-tenant do resto da suíte. São só leitura, com UMA exceção
// (propor_regra), que mesmo assim nunca escreve uma regra ativa — só um
// rascunho que um humano precisa confirmar depois pela UI. O modelo não tem
// nenhuma ferramenta de escrita além dessa, de propósito: ele nunca altera
// dado de negócio (não marca NC como resolvida, não fecha programação,
// nada) — só conversa e propõe regras de monitoramento.

export interface ChatToolContext {
  tenantId: string;
  userId: string;
}

// Formato mínimo compatível com Anthropic.Messages.Tool — não importamos o
// tipo do SDK aqui pra não acoplar este arquivo à versão exata instalada
// (mesmo motivo do narrator.ts tratar a resposta de forma pouco acoplada).
export interface ChatToolDef {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const CHAT_TOOLS: ChatToolDef[] = [
  {
    name: "listar_metricas",
    description:
      "Lista o catálogo fixo de métricas que o sistema sabe calcular por UH (unidade habitacional). " +
      "Use antes de propor uma regra, pra saber quais metricKey existem — nunca invente uma métrica fora desta lista.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "consultar_metricas_uh",
    description:
      "Consulta os valores atuais das métricas conhecidas pra uma UH específica (ou todas, se uhNumero " +
      "não for informado). Use pra responder perguntas sobre o estado atual de uma unidade.",
    input_schema: {
      type: "object",
      properties: {
        uhNumero: { type: "string", description: "Número/identificador da UH, ex.: '603-V'. Omitir pra todas." },
      },
    },
  },
  {
    name: "consultar_insights_recentes",
    description:
      "Consulta os insights mais recentes já gerados pela Central de Inteligência (alertas automáticos dos " +
      "detectores). Use pra responder 'o que está acontecendo' ou 'tem algo pendente'.",
    input_schema: {
      type: "object",
      properties: {
        limite: { type: "number", description: "Quantos insights retornar, no máximo 50. Padrão 10." },
        apenasAtivos: { type: "boolean", description: "Se true, só ABERTO/LIDO. Padrão true." },
      },
    },
  },
  {
    name: "consultar_ncs_abertas",
    description:
      "Consulta as não conformidades (NCs) de Manutenção ainda em aberto, opcionalmente filtradas por UH.",
    input_schema: {
      type: "object",
      properties: {
        uhNumero: { type: "string", description: "Número da UH, ex.: '603-V'. Omitir pra todas as UHs." },
      },
    },
  },
  {
    name: "consultar_falhas_gerenciais_pendentes",
    description: "Consulta as Falhas Gerenciais (Governança) ainda pendentes de decisão.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "propor_regra",
    description:
      "Cria um RASCUNHO de regra de monitoramento a partir do que o usuário pediu na conversa. A regra " +
      "nasce inativa — só passa a valer depois que o usuário confirmar explicitamente pela interface (nunca " +
      "diga ao usuário que a regra já está ativa). Use somente depois de confirmar com o usuário o que ele " +
      "quer monitorar, e sempre baseado numa métrica real de listar_metricas.",
    input_schema: {
      type: "object",
      properties: {
        label: { type: "string", description: "Descrição curta, ex.: 'UH sem inspeção há muito tempo'." },
        metricKey: { type: "string", description: "Uma chave exata do catálogo (ver listar_metricas)." },
        operator: { type: "string", enum: ["GT", "GTE", "LT", "LTE", "EQ"], description: "Comparador." },
        threshold: { type: "number", description: "Valor limite pra disparar o alerta." },
        priority: { type: "string", enum: ["BAIXA", "MEDIA", "ALTA", "CRITICA"], description: "Prioridade do alerta gerado." },
        explanation: {
          type: "string",
          description: "Texto do alerta quando disparar. Pode usar {{uh}} e {{valor}} como placeholders.",
        },
        recommendedAction: { type: "string", description: "Ação recomendada quando o alerta aparecer." },
      },
      required: ["label", "metricKey", "operator", "threshold", "priority", "explanation", "recommendedAction"],
    },
  },
];

const PRIORIDADES_VALIDAS = new Set(["BAIXA", "MEDIA", "ALTA", "CRITICA"]);
const OPERADORES_VALIDOS = new Set(["GT", "GTE", "LT", "LTE", "EQ"]);

export async function executeChatTool(
  ctx: ChatToolContext,
  toolName: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (toolName) {
    case "listar_metricas": {
      return METRIC_CATALOG;
    }

    case "consultar_metricas_uh": {
      const uhNumero = typeof input.uhNumero === "string" ? input.uhNumero : undefined;
      const where = uhNumero
        ? { tenantId: ctx.tenantId, numero: uhNumero }
        : { tenantId: ctx.tenantId, ativo: true };
      const uhs = await prisma.uH.findMany({ where, select: { id: true, numero: true }, take: 100 });
      if (uhs.length === 0) return { erro: `Nenhuma UH encontrada${uhNumero ? ` com número "${uhNumero}"` : ""}.` };

      const snapshots = await prisma.aiEntitySnapshot.findMany({
        where: { tenantId: ctx.tenantId, module: "CORE", entityType: "UH", entityId: { in: uhs.map((u) => u.id) } },
      });
      const snapPorUh = new Map(snapshots.map((s) => [s.entityId, s.metrics]));

      return uhs.map((uh) => ({
        uh: uh.numero,
        metricas: snapPorUh.has(uh.id) ? JSON.parse(snapPorUh.get(uh.id)!) : "ainda não calculado",
      }));
    }

    case "consultar_insights_recentes": {
      const limite = Math.min(typeof input.limite === "number" ? input.limite : 10, 50);
      const apenasAtivos = input.apenasAtivos !== false;
      const insights = await prisma.aiInsight.findMany({
        where: apenasAtivos
          ? { tenantId: ctx.tenantId, status: { in: ["ABERTO", "LIDO"] } }
          : { tenantId: ctx.tenantId },
        orderBy: { lastSeenAt: "desc" },
        take: limite,
        select: { title: true, explanation: true, priority: true, module: true, status: true, lastSeenAt: true },
      });
      return insights;
    }

    case "consultar_ncs_abertas": {
      const uhNumero = typeof input.uhNumero === "string" ? input.uhNumero : undefined;
      const cards = await prisma.maintenanceCorrectionCard.findMany({
        where: {
          tenantId: ctx.tenantId,
          inspectionItem: { status: "NAO_CONFORME" },
          ...(uhNumero ? { uh: { numero: uhNumero } } : {}),
        },
        include: {
          uh: { select: { numero: true } },
          checklistItem: { select: { name: true } },
          inspectionItem: { select: { urgente: true, comment: true } },
        },
        take: 100,
        orderBy: { createdAt: "asc" },
      });
      return cards.map((c) => ({
        uh: c.uh.numero,
        item: c.checklistItem?.name ?? "item removido do catálogo",
        urgente: c.inspectionItem.urgente,
        descricao: c.inspectionItem.comment ?? "",
        executionStatus: c.executionStatus,
        criadoEm: c.createdAt.toISOString(),
      }));
    }

    case "consultar_falhas_gerenciais_pendentes": {
      const falhas = await prisma.hkManagerialFailureCard.findMany({
        where: { tenantId: ctx.tenantId, status: "PENDENTE" },
        include: { uh: { select: { numero: true } } },
        take: 100,
        orderBy: { createdAt: "asc" },
      });
      return falhas.map((f) => ({
        uh: f.uh.numero,
        item: f.itemNome,
        descricao: f.descricao,
        criadoEm: f.createdAt.toISOString(),
      }));
    }

    case "propor_regra": {
      const metricKey = String(input.metricKey ?? "");
      const operator = String(input.operator ?? "");
      const priority = String(input.priority ?? "");
      if (!isMetricaValida(metricKey)) {
        return { erro: `Métrica "${metricKey}" não existe no catálogo. Use listar_metricas primeiro.` };
      }
      if (!OPERADORES_VALIDOS.has(operator)) {
        return { erro: `Operador "${operator}" inválido. Use GT, GTE, LT, LTE ou EQ.` };
      }
      if (!PRIORIDADES_VALIDAS.has(priority)) {
        return { erro: `Prioridade "${priority}" inválida. Use BAIXA, MEDIA, ALTA ou CRITICA.` };
      }
      const threshold = Number(input.threshold);
      if (!Number.isFinite(threshold)) {
        return { erro: "threshold precisa ser um número." };
      }

      const regra = await prisma.aiCustomRule.create({
        data: {
          tenantId: ctx.tenantId,
          createdById: ctx.userId,
          active: false,
          label: String(input.label ?? "Regra sem nome"),
          module: METRIC_CATALOG.find((m) => m.key === metricKey)?.module ?? "CUSTOM",
          entityType: "UH",
          metricKey,
          operator: operator as "GT" | "GTE" | "LT" | "LTE" | "EQ",
          threshold,
          priority: priority as "BAIXA" | "MEDIA" | "ALTA" | "CRITICA",
          explanation: String(input.explanation ?? ""),
          recommendedAction: String(input.recommendedAction ?? ""),
        },
      });

      return {
        ok: true,
        ruleId: regra.id,
        aviso:
          "Regra criada como RASCUNHO (ainda inativa). Diga ao usuário que ela vai aparecer em " +
          "'Minhas regras' na Central de Inteligência, e que ele precisa confirmar por lá pra ativá-la.",
      };
    }

    default:
      return { erro: `Ferramenta "${toolName}" não existe.` };
  }
}
