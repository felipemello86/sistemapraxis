"use client";
import { useState } from "react";

// Formulário de "Agendar demonstração" da landing page (src/app/page.tsx).
// Client component isolado porque o resto da landing é estático (Server
// Component) — só este pedaço precisa de estado/JS no navegador.
const NAVY = "#10284D";
const DOURADO = "#D8A63A";

// Campos sem caixa: só um fio embaixo, no mesmo partido editorial da página
// (ver comentário de direção visual em page.tsx).
const campoBase: React.CSSProperties = {
  width: "100%",
  padding: "10px 0",
  borderRadius: 0,
  border: "none",
  borderBottom: "1px solid rgba(16,40,77,0.22)",
  background: "transparent",
  fontSize: 16,
  color: NAVY,
  fontFamily: "inherit",
  boxSizing: "border-box",
  outline: "none",
};

const rotuloBase: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "rgba(16,40,77,0.55)",
  marginBottom: 4,
};

export default function DemoForm() {
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);

    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: fd.get("nome"),
          hotel: fd.get("hotel"),
          email: fd.get("email"),
          telefone: fd.get("telefone"),
          mensagem: fd.get("mensagem"),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Não foi possível enviar agora.");
      }
      setEnviado(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar agora.");
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center", borderTop: "1px solid rgba(16,40,77,0.11)" }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            border: `2px solid ${DOURADO}`,
            color: DOURADO,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
            fontSize: 26,
          }}
          aria-hidden
        >
          ✓
        </div>
        <h3 style={{ margin: "0 0 8px", fontSize: 20, color: NAVY }}>Pedido recebido</h3>
        <p style={{ margin: 0, color: "rgba(16,40,77,0.7)", fontSize: 15, lineHeight: 1.6 }}>
          Entraremos em contato para combinar o melhor horário da sua demonstração.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: 26 }}>
        <div>
          <label style={rotuloBase} htmlFor="demo-nome">
            Seu nome
          </label>
          <input id="demo-nome" name="nome" required maxLength={120} style={campoBase} autoComplete="name" />
        </div>
        <div>
          <label style={rotuloBase} htmlFor="demo-hotel">
            Hotel / pousada
          </label>
          <input id="demo-hotel" name="hotel" required maxLength={120} style={campoBase} autoComplete="organization" />
        </div>
        <div>
          <label style={rotuloBase} htmlFor="demo-email">
            E-mail
          </label>
          <input
            id="demo-email"
            name="email"
            type="email"
            required
            maxLength={160}
            style={campoBase}
            autoComplete="email"
          />
        </div>
        <div>
          <label style={rotuloBase} htmlFor="demo-telefone">
            Telefone / WhatsApp
          </label>
          <input
            id="demo-telefone"
            name="telefone"
            required
            maxLength={40}
            style={campoBase}
            autoComplete="tel"
            inputMode="tel"
          />
        </div>
      </div>

      <div>
        <label style={rotuloBase} htmlFor="demo-mensagem">
          O que mais pesa na sua operação hoje? <span style={{ fontWeight: 400, opacity: 0.6 }}>(opcional)</span>
        </label>
        <textarea
          id="demo-mensagem"
          name="mensagem"
          rows={3}
          maxLength={2000}
          style={{ ...campoBase, resize: "vertical", minHeight: 84 }}
        />
      </div>

      {erro && (
        <p style={{ margin: 0, color: "#b3261e", fontSize: 14 }} role="alert">
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        style={{
          padding: "16px 24px",
          borderRadius: 4,
          border: "none",
          background: enviando ? "rgba(16,40,77,0.45)" : NAVY,
          color: "#fff",
          fontSize: 15.5,
          fontWeight: 600,
          cursor: enviando ? "default" : "pointer",
          fontFamily: "inherit",
          marginTop: 6,
        }}
      >
        {enviando ? "Enviando…" : "Agendar demonstração"}
      </button>

      <p style={{ margin: 0, fontSize: 12.5, color: "rgba(16,40,77,0.55)", textAlign: "center" }}>
        Usamos seus dados apenas para entrar em contato sobre a demonstração.
      </p>
    </form>
  );
}
