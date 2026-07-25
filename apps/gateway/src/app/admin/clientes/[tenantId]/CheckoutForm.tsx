"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { CheckoutResult } from "../../actions";

const initialState: CheckoutResult | null = null;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        padding: "10px 16px",
        borderRadius: 10,
        border: "none",
        background: pending ? "#a1a1a6" : "#0071e3",
        color: "#fff",
        fontSize: 13,
        fontWeight: 600,
        cursor: pending ? "default" : "pointer",
      }}
    >
      {pending ? "Gerando..." : "Gerar link de checkout"}
    </button>
  );
}

export function CheckoutForm({
  tenantId,
  planos,
  action,
}: {
  tenantId: string;
  planos: { id: string; nome: string; valorCentavos: number; intervalo: string }[];
  action: (prevState: CheckoutResult | null, formData: FormData) => Promise<CheckoutResult>;
}) {
  const [state, formAction] = useFormState(action, initialState);

  if (planos.length === 0) {
    return (
      <p style={{ color: "#6e6e73", fontSize: 13 }}>
        Cadastre um plano no painel principal antes de gerar um link de checkout.
      </p>
    );
  }

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select
          name="planId"
          required
          style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #d2d2d7", fontSize: 13, flex: 1, minWidth: 180 }}
        >
          {planos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome} — R$ {(p.valorCentavos / 100).toFixed(2)}/{p.intervalo === "YEAR" ? "ano" : "mês"}
            </option>
          ))}
        </select>
        <SubmitButton />
      </div>

      {state && !state.ok && <p style={{ color: "#d70015", fontSize: 13, margin: 0 }}>{state.error}</p>}

      {state && state.ok && (
        <div style={{ background: "#f5f5f7", borderRadius: 10, padding: 12 }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#6e6e73" }}>
            Link gerado — copie e envie pro cliente:
          </p>
          <a href={state.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, wordBreak: "break-all", color: "#0071e3" }}>
            {state.url}
          </a>
        </div>
      )}
    </form>
  );
}
