"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { AdminActionResult } from "../../actions";

const initialState: AdminActionResult | null = null;

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 9,
  border: "1px solid #d2d2d7",
  fontSize: 13,
  flex: 1,
  minWidth: 140,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        padding: "9px 16px",
        borderRadius: 9,
        border: "none",
        background: pending ? "#a1a1a6" : "#1d1d1f",
        color: "#fff",
        fontSize: 13,
        fontWeight: 600,
        cursor: pending ? "default" : "pointer",
      }}
    >
      {pending ? "Salvando..." : "Adicionar etapa"}
    </button>
  );
}

export function NovaEtapaForm({
  action,
}: {
  action: (prevState: AdminActionResult | null, formData: FormData) => Promise<AdminActionResult>;
}) {
  const [state, formAction] = useFormState(action, initialState);
  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input name="nome" placeholder="Nome da etapa (ex: Contrato enviado)" required style={inputStyle} />
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" name="ehGanho" /> Marca fechamento (ganho)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" name="ehPerdido" /> Marca perda
        </label>
      </div>
      {state && !state.ok && <p style={{ color: "#d70015", fontSize: 13, margin: 0 }}>{state.error}</p>}
      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
