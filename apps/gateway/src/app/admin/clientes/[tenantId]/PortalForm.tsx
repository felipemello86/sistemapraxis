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
        padding: "9px 14px",
        borderRadius: 9,
        border: "1px solid #d2d2d7",
        background: "#fff",
        color: "#1d1d1f",
        fontSize: 13,
        fontWeight: 600,
        cursor: pending ? "default" : "pointer",
      }}
    >
      {pending ? "Gerando..." : "Abrir portal de faturamento"}
    </button>
  );
}

export function PortalForm({
  tenantId,
  action,
}: {
  tenantId: string;
  action: (prevState: CheckoutResult | null, formData: FormData) => Promise<CheckoutResult>;
}) {
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <div>
        <SubmitButton />
      </div>
      {state && !state.ok && <p style={{ color: "#d70015", fontSize: 13, margin: 0 }}>{state.error}</p>}
      {state && state.ok && (
        <a href={state.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#0071e3" }}>
          Abrir portal →
        </a>
      )}
    </form>
  );
}
