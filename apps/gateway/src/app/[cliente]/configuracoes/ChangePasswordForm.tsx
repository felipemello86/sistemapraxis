"use client";

import { useFormState, useFormStatus } from "react-dom";
import { changePasswordAction, ChangePasswordResult } from "../actions";

const initialState: ChangePasswordResult | null = null;

function BotaoSalvar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        padding: "12px 20px",
        borderRadius: 12,
        border: "none",
        background: pending ? "#a1a1a6" : "#1d1d1f",
        color: "#fff",
        fontWeight: 600,
        fontSize: 15,
        cursor: pending ? "default" : "pointer",
      }}
    >
      {pending ? "Salvando..." : "Salvar nova senha"}
    </button>
  );
}

export function ChangePasswordForm({ temSenha }: { temSenha: boolean }) {
  const [state, formAction] = useFormState(changePasswordAction, initialState);

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 360 }}
    >
      {temSenha && (
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "#6e6e73" }}>
          Senha atual
          <input
            type="password"
            name="senhaAtual"
            required
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d2d7", fontSize: 15 }}
          />
        </label>
      )}
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "#6e6e73" }}>
        Nova senha
        <input
          type="password"
          name="novaSenha"
          required
          minLength={6}
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d2d7", fontSize: 15 }}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "#6e6e73" }}>
        Confirmar nova senha
        <input
          type="password"
          name="confirmacao"
          required
          minLength={6}
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d2d7", fontSize: 15 }}
        />
      </label>

      {state && !state.ok && (
        <p style={{ color: "#d70015", fontSize: 14, margin: 0 }}>{state.error}</p>
      )}
      {state && state.ok && (
        <p style={{ color: "#1a7f37", fontSize: 14, margin: 0 }}>Senha atualizada com sucesso.</p>
      )}

      <BotaoSalvar />
    </form>
  );
}
