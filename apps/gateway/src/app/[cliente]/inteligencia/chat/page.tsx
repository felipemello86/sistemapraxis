import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { prisma, getSession, hasModuleAccess } from "@praxis/core";
import { iniciarConversaAction } from "./actions";

// Lista de conversas do chat da Central de Inteligência — uma por usuário
// (ver AiConversation.userId), não compartilhada entre a equipe do tenant.
// Mesmo padrão SSR do resto do gateway: iniciar uma conversa é um form que
// já manda a primeira mensagem, cria a conversa, roda o primeiro turno e
// redireciona pra tela da conversa.

function formatarDataHora(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function ChatIA({ params }: { params: { cliente: string } }) {
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

  const conversas = await prisma.aiConversation.findMany({
    where: { tenantId: tenant.id, userId: session.userId },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  const boundIniciar = iniciarConversaAction.bind(null, tenant.slug);

  return (
    <main style={{ minHeight: "100svh", padding: "max(20px, env(safe-area-inset-top)) 20px 40px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <a href={`/${tenant.slug}/inteligencia`} style={linkStyle}>
          ← Central de Inteligência
        </a>

        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "12px 0 4px" }}>Chat com a IA</h1>
        <p style={{ color: "#6e6e73", fontSize: 14, margin: "0 0 20px" }}>
          Pergunte sobre o que está acontecendo no hotel agora, ou peça pra ser avisado quando algo acontecer —
          a IA pode propor uma regra de monitoramento, mas ela só passa a valer depois que você confirmar em{" "}
          <a href={`/${tenant.slug}/inteligencia/regras`} style={{ color: "#0071e3" }}>
            Minhas regras
          </a>
          .
        </p>

        <form action={boundIniciar} style={{ display: "flex", gap: 8, marginBottom: 28 }}>
          <input
            name="mensagem"
            placeholder="Ex.: quais UHs têm NC aberta agora?"
            required
            style={inputStyle}
          />
          <button type="submit" style={primaryButtonStyle}>
            Perguntar
          </button>
        </form>

        {conversas.length === 0 ? (
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 32,
              textAlign: "center",
              boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
            }}
          >
            <p style={{ margin: 0, color: "#6e6e73", fontSize: 14 }}>Nenhuma conversa ainda.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {conversas.map((c) => (
              <a
                key={c.id}
                href={`/${tenant.slug}/inteligencia/chat/${c.id}`}
                style={{
                  display: "block",
                  background: "#fff",
                  borderRadius: 14,
                  padding: "14px 16px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                  textDecoration: "none",
                  color: "#1d1d1f",
                }}
              >
                <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600 }}>{c.title}</p>
                <span style={{ fontSize: 12, color: "#6e6e73" }}>{formatarDataHora(c.updatedAt)}</span>
              </a>
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
