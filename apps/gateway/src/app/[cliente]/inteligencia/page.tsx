import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { prisma, getSession, hasModuleAccess, type AiInsightStatus } from "@praxis/core";
import { marcarLidoAction, resolverInsightAction, descartarInsightAction } from "./actions";

// Central de Inteligência — feed contínuo dos insights gerados pelos
// detectores do @praxis/ai-engine (ver runDetectorsForTenant, chamado pelo
// cron em api/cron/ai-engine). Puramente SSR, sem client JS: cada ação
// (marcar como lido/resolver/descartar) é um form ligado a uma Server
// Action (mesmo padrão do resto deste app — ver actions.ts). A ordenação
// por prioridade é feita aqui, não no banco: AiInsightPriority é um enum
// alfabético (ALTA, BAIXA, CRITICA, MEDIA), que não bate com a ordem de
// severidade real.

const PRIORITY_LABEL: Record<string, string> = {
  CRITICA: "Crítica",
  ALTA: "Alta",
  MEDIA: "Média",
  BAIXA: "Baixa",
};
const PRIORITY_COLOR: Record<string, string> = {
  CRITICA: "#d70015",
  ALTA: "#ff9500",
  MEDIA: "#0071e3",
  BAIXA: "#6e6e73",
};
const PRIORITY_RANK: Record<string, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };
const MODULE_LABEL: Record<string, string> = {
  MAINTENANCE: "Manutenção",
  HOUSEKEEPING: "Governança",
  BOOKING_REVIEWS: "Avaliações",
  STOCK: "Estoque",
  RESTAURANT: "Restaurante",
};

type FiltroStatus = "ATIVOS" | "RESOLVIDO" | "DESCARTADO" | "TODOS";

const FILTROS: { id: FiltroStatus; label: string }[] = [
  { id: "ATIVOS", label: "Ativos" },
  { id: "RESOLVIDO", label: "Resolvidos" },
  { id: "DESCARTADO", label: "Descartados" },
  { id: "TODOS", label: "Todos" },
];

function formatarDataHora(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function CentralInteligencia({
  params,
  searchParams,
}: {
  params: { cliente: string };
  searchParams: { status?: string };
}) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: params.cliente } });
  if (!tenant) notFound();

  const session = await getSession();

  if (!session) {
    return (
      <main style={pageStyle}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Entre primeiro</h1>
          <a href={`/${tenant.slug}`} style={linkStyle}>
            ← Voltar
          </a>
        </div>
      </main>
    );
  }

  const podeAcessar = await hasModuleAccess(session, "INTELLIGENCE");
  if (!podeAcessar) {
    return (
      <main style={pageStyle}>
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Central de Inteligência</h1>
          <p style={{ color: "#6e6e73", fontSize: 14, marginTop: 8 }}>
            Você não tem acesso a este módulo ainda.
          </p>
          <a href={`/${tenant.slug}`} style={linkStyle}>
            ← Voltar
          </a>
        </div>
      </main>
    );
  }

  const filtroBruto = searchParams.status?.toUpperCase();
  const filtro: FiltroStatus = FILTROS.some((f) => f.id === filtroBruto) ? (filtroBruto as FiltroStatus) : "ATIVOS";
  const ATIVOS_STATUSES: AiInsightStatus[] = ["ABERTO", "LIDO"];
  const where =
    filtro === "TODOS"
      ? { tenantId: tenant.id }
      : filtro === "ATIVOS"
        ? { tenantId: tenant.id, status: { in: ATIVOS_STATUSES } }
        : { tenantId: tenant.id, status: filtro as AiInsightStatus };

  const insightsBrutos = await prisma.aiInsight.findMany({
    where,
    orderBy: { lastSeenAt: "desc" },
    take: 100,
  });

  const insights = [...insightsBrutos].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.lastSeenAt.getTime() - a.lastSeenAt.getTime(),
  );

  const boundMarcarLido = marcarLidoAction.bind(null, tenant.slug);
  const boundResolver = resolverInsightAction.bind(null, tenant.slug);
  const boundDescartar = descartarInsightAction.bind(null, tenant.slug);

  return (
    <main style={{ minHeight: "100svh", padding: "max(20px, env(safe-area-inset-top)) 20px 40px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <a href={`/${tenant.slug}`} style={linkStyle}>
          ← Início
        </a>

        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "12px 0 4px" }}>Central de Inteligência</h1>
        <p style={{ color: "#6e6e73", fontSize: 14, margin: "0 0 16px" }}>
          Alertas e oportunidades detectados automaticamente a partir dos módulos — sem precisar perguntar.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <a href={`/${tenant.slug}/inteligencia/chat`} style={navLinkStyle}>
            Chat com a IA
          </a>
          <a href={`/${tenant.slug}/inteligencia/regras`} style={navLinkStyle}>
            Minhas regras
          </a>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {FILTROS.map((f) => (
            <a
              key={f.id}
              href={`/${tenant.slug}/inteligencia?status=${f.id}`}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                background: filtro === f.id ? "#0071e3" : "#fff",
                color: filtro === f.id ? "#fff" : "#1d1d1f",
                boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
              }}
            >
              {f.label}
            </a>
          ))}
        </div>

        {insights.length === 0 ? (
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 32,
              textAlign: "center",
              boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
            }}
          >
            <p style={{ margin: 0, color: "#6e6e73", fontSize: 14 }}>
              {filtro === "ATIVOS"
                ? "Nenhum alerta ativo no momento — tudo dentro do esperado."
                : "Nada por aqui com este filtro."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {insights.map((insight) => {
              let evidence: { label: string; value: string | number }[] = [];
              try {
                evidence = JSON.parse(insight.evidence);
              } catch {
                evidence = [];
              }

              return (
                <div
                  key={insight.id}
                  style={{
                    background: "#fff",
                    borderRadius: 16,
                    padding: 18,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                    opacity: insight.status === "DESCARTADO" ? 0.6 : 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#fff",
                        background: PRIORITY_COLOR[insight.priority] ?? "#6e6e73",
                        borderRadius: 999,
                        padding: "3px 10px",
                        letterSpacing: 0.2,
                      }}
                    >
                      {PRIORITY_LABEL[insight.priority] ?? insight.priority}
                    </span>
                    <span style={{ fontSize: 12, color: "#6e6e73" }}>
                      {MODULE_LABEL[insight.module] ?? insight.module}
                    </span>
                    <span style={{ fontSize: 12, color: "#c7c7cc" }}>·</span>
                    <span style={{ fontSize: 12, color: "#6e6e73" }}>{formatarDataHora(insight.lastSeenAt)}</span>
                    <span style={{ fontSize: 12, color: "#c7c7cc" }}>·</span>
                    <span style={{ fontSize: 12, color: "#6e6e73" }}>
                      {Math.round(insight.confidence * 100)}% de confiança
                    </span>
                  </div>

                  <p style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>{insight.title}</p>
                  <p style={{ fontSize: 14, color: "#3a3a3c", margin: "0 0 10px", lineHeight: 1.45 }}>
                    {insight.explanation}
                  </p>

                  {evidence.length > 0 && (
                    <div
                      style={{
                        background: "#f5f5f7",
                        borderRadius: 10,
                        padding: "8px 12px",
                        marginBottom: 10,
                        fontSize: 12,
                        color: "#6e6e73",
                      }}
                    >
                      {evidence.map((e, i) => (
                        <div key={i}>
                          {e.label}: <strong style={{ color: "#1d1d1f" }}>{String(e.value)}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  <div
                    style={{
                      borderLeft: "3px solid #0071e3",
                      paddingLeft: 10,
                      fontSize: 13,
                      color: "#1d1d1f",
                      marginBottom: 14,
                    }}
                  >
                    <strong>Ação recomendada:</strong> {insight.recommendedAction}
                  </div>

                  {insight.status !== "RESOLVIDO" && insight.status !== "DESCARTADO" && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {insight.status === "ABERTO" && (
                        <form action={boundMarcarLido.bind(null, insight.id)}>
                          <button type="submit" style={secondaryButtonStyle}>
                            Marcar como lido
                          </button>
                        </form>
                      )}
                      <form action={boundResolver.bind(null, insight.id)}>
                        <button type="submit" style={primaryButtonStyle}>
                          Resolver
                        </button>
                      </form>
                      <form action={boundDescartar.bind(null, insight.id)}>
                        <button type="submit" style={secondaryButtonStyle}>
                          Descartar
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100svh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  padding: 24,
};

const linkStyle: CSSProperties = {
  color: "#0071e3",
  fontSize: 14,
  textDecoration: "none",
  display: "inline-block",
  marginTop: 8,
};

const navLinkStyle: CSSProperties = {
  padding: "8px 16px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 600,
  textDecoration: "none",
  background: "#fff",
  color: "#0071e3",
  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
};

const primaryButtonStyle: CSSProperties = {
  background: "#0071e3",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "7px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  background: "#f5f5f7",
  color: "#1d1d1f",
  border: "none",
  borderRadius: 10,
  padding: "7px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
