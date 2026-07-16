"use client";

import { useFormState, useFormStatus } from "react-dom";
import { loginAction, type LoginResult } from "./actions";

const initialState: LoginResult | null = null;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        width: "100%",
        padding: "12px 16px",
        borderRadius: 12,
        border: "none",
        background: pending ? "#a1a1a6" : "#1d1d1f",
        color: "#fff",
        fontSize: 15,
        fontWeight: 600,
        cursor: pending ? "default" : "pointer",
      }}
    >
      {pending ? "Entrando..." : "Entrar"}
    </button>
  );
}

export function LoginForm({ clienteSlug }: { clienteSlug: string }) {
  const boundAction = loginAction.bind(null, clienteSlug);
  const [state, formAction] = useFormState(boundAction, initialState);

  return (
    <form
      action={formAction}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: "100%",
        maxWidth: 320,
        margin: "0 auto",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="email" style={{ fontSize: 13, color: "#6e6e73", fontWeight: 500 }}>
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          style={{
            padding: "11px 14px",
            borderRadius: 12,
            border: "1px solid #d2d2d7",
            fontSize: 15,
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="senha" style={{ fontSize: 13, color: "#6e6e73", fontWeight: 500 }}>
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          required
          autoComplete="current-password"
          style={{
            padding: "11px 14px",
            borderRadius: 12,
            border: "1px solid #d2d2d7",
            fontSize: 15,
          }}
        />
      </div>

      {state && !state.ok && (
        <p style={{ color: "#d70015", fontSize: 13, margin: 0 }}>{state.error}</p>
      )}

      <div style={{ marginTop: 4 }}>
        <SubmitButton />
      </div>
    </form>
  );
}
