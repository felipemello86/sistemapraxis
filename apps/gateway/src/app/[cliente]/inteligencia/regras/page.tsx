import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { prisma, getSession, hasModuleAccess } from "@praxis/core";
import { ativarRegraAction, desativarRegraAction, excluirRegraAction } from "./actions";

// Gestão de regras customizadas criadas pelo chat (AiCustomRule). Toda
// regra chega aqui como rascunho (active: false) — esta tela é o único
// lugar onde uma regra passa a valer de verdade, por confirmação humana
// explícita (ver chat/tools.ts, propor_regra, e a decisão de arquitetura
// original: o modelo nunca ativa uma regra sozinho).

const OPERATOR_LABEL: Record<string, string> = { GT: ">", GTE: "≥", LT: "<", LTE: "≤", EQ: "=" };
const PRIORITY_LABEL: Record<string, string> = { CRITICA: "Crítica", ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa" };
const PRIORITY_COLOR: Record<string, string> = {
  CRITICA: "#d70015",
  ALTA: "#ff9500",
  MEDIA: "#0071e3",
  BAIXA: "#6e6e73",
};

function formatarData(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

export default async function RegrasIA({ params }: { params: { cliente: string } }) {
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
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Minhas regras</h1>
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

  const regras = await prisma.aiCustomRule.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { nome: true } } },
  });

  const boundAtivar = ativarRegraAction.bind(null, tenant.slug);
  const boundDesativar = desativarRegraAction.bind(null, tenant.slug);
  const boundExcluir = excluirRegraAction.bind(null, tenant.slug);

  return (
    <main style={{ minHeight: "100svh", padding: "max(20px, env(safe-area-inset-top)) 20px 40px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <a href={`/${tenant.slug}/inteligencia`} style={linkStyle}>
          ← Central de Inteligência
        </a>

        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "12px 0 4px" }}>Minhas regras</h1>
        <p style={{ color: "#6e6e73", fontSize: 14, margin: "0 0 20px" }}>
          Regras propostas pelo{" "}
          <a href={`/${tenant.slug}/inteligencia/chat`} style={{ color: "#0071e3" }}>
            chat
          </a>
          . Uma regra só passa a gerar alertas depois de você ativá-la aqui.
        </p>

        {regras.length === 0 ? (
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
              Nenhuma regra ainda — peça no chat pra criar uma.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {regras.map((r) => (
              <div
                key={r.id}
                style={{
                  background: "#fff",
                  borderRadius: 16,
                  padding: 18,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#fff",
                      background: r.active ? "#34c759" : "#8e8e93",
                      borderRadius: 999,
                      padding: "3px 10px",
                      letterSpacing: 0.2,
                    }}
                  >
                    {r.active ? "Ativa" : "Rascunho"}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#fff",
                      background: PRIORITY_COLOR[r.priority] ?? "#6e6e73",
                      borderRadius: 999,
                      padding: "3px 10px",
                    }}
                  >
                    {PRIORITY_LABEL[r.priority] ?? r.priority}
                  </span>
                  <span style={{ fontSize: 12, color: "#6e6e73" }}>
                    criada por {r.createdBy.nome} em {formatarData(r.createdAt)}
                  </span>
                </div>

                <p style={{ fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>{r.label}</p>
                <p style={{ fontSize: 13, color: "#6e6e73", margin: "0 0 10px", fontFamily: "monospace" }}>
                  {r.metricKey} {OPERATOR_LABEL[r.operator] ?? r.operator} {r.threshold}
                </p>
                <p style={{ fontSize: 14, color: "#3a3a3c", margin: "0 0 10px", lineHeight: 1.45 }}>
                  {r.explanation}
                </p>
                <div
                  style={{
                    borderLeft: "3px solid #0071e3",
                    paddingLeft: 10,
                    fontSize: 13,
                    color: "#1d1d1f",
                    marginBottom: 14,
                  }}
                >
                  <strong>Ação recomendada:</strong> {r.recommendedAction}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {r.active ? (
                    <form action={boundDesativar.bind(null, r.id)}>
                      <button type="submit" style={secondaryButtonStyle}>
                        Desativar
                      </button>
                    </form>
                  ) : (
                    <form action={boundAtivar.bind(null, r.id)}>
                      <button type="submit" style={primaryButtonStyle}>
                        Ativar
                      </button>
                    </form>
                  )}
                  <form action={boundExcluir.bind(null, r.id)}>
                    <button type="submit" style={secondaryButtonStyle}>
                      Excluir
                    </button>
                  </form>
                </div>
              </div>
            ))}
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
