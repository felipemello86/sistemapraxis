import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { prisma, getSession, hasModuleAccess } from "@praxis/core";
import { enviarMensagemAction } from "../actions";

// Thread de uma conversa — cada mensagem já é gravada (AiMessage), a
// resposta do assistente mostra opcionalmente quais ferramentas foram
// consultadas (toolCalls), como forma de transparência sobre o que é dado
// real consultado vs. o que é texto gerado.

function formatarHora(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(d);
}

const TOOL_LABEL: Record<string, string> = {
  listar_metricas: "catálogo de métricas",
  consultar_metricas_uh: "métricas das UHs",
  consultar_insights_recentes: "insights recentes",
  consultar_ncs_abertas: "NCs abertas",
  consultar_falhas_gerenciais_pendentes: "falhas gerenciais pendentes",
  propor_regra: "criação de regra (rascunho)",
};

export default async function ConversaIA({
  params,
}: {
  params: { cliente: string; conversationId: string };
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
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Chat com a IA</h1>
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

  const conversa = await prisma.aiConversation.findUnique({ where: { id: params.conversationId } });
  if (!conversa || conversa.tenantId !== tenant.id || conversa.userId !== session.userId) notFound();

  const mensagens = await prisma.aiMessage.findMany({
    where: { conversationId: conversa.id },
    orderBy: { createdAt: "asc" },
  });

  const boundEnviar = enviarMensagemAction.bind(null, tenant.slug, conversa.id);

  return (
    <main style={{ minHeight: "100svh", padding: "max(20px, env(safe-area-inset-top)) 20px 40px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <a href={`/${tenant.slug}/inteligencia/chat`} style={linkStyle}>
          ← Conversas
        </a>

        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "12px 0 20px" }}>{conversa.title}</h1>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          {mensagens.map((m) => {
            let toolCalls: { name: string }[] = [];
            try {
              toolCalls = JSON.parse(m.toolCalls);
            } catch {
              toolCalls = [];
            }
            const isUser = m.role === "USER";
            return (
              <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
                <div
                  style={{
                    maxWidth: "80%",
                    background: isUser ? "#0071e3" : "#fff",
                    color: isUser ? "#fff" : "#1d1d1f",
                    borderRadius: 16,
                    padding: "10px 14px",
                    fontSize: 14,
                    lineHeight: 1.45,
                    boxShadow: isUser ? "none" : "0 1px 2px rgba(0,0,0,0.06)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.content}
                </div>
                {!isUser && toolCalls.length > 0 && (
                  <span style={{ fontSize: 11, color: "#6e6e73", marginTop: 4 }}>
                    consultou: {toolCalls.map((t) => TOOL_LABEL[t.name] ?? t.name).join(", ")}
                  </span>
                )}
                <span style={{ fontSize: 11, color: "#c7c7cc", marginTop: 2 }}>{formatarHora(m.createdAt)}</span>
              </div>
            );
          })}
        </div>

        <form action={boundEnviar} style={{ display: "flex", gap: 8 }}>
          <input name="mensagem" placeholder="Escreva uma mensagem..." required style={inputStyle} />
          <button type="submit" style={primaryButtonStyle}>
            Enviar
          </button>
        </form>
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

const inputStyle: CSSProperties = {
  flex: 1,
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 14,
  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
  background: "#fff",
};

const primaryButtonStyle: CSSProperties = {
  background: "#0071e3",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};
