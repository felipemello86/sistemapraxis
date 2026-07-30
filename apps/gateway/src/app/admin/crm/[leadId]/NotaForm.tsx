"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { AdminActionResult } from "../../actions";

const initialState: AdminActionResult | null = null;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        padding: "8px 14px",
        borderRadius: 9,
        border: "none",
        background: pending ? "#a1a1a6" : "#1d1d1f",
        color: "#fff",
        fontSize: 13,
        fontWeight: 600,
        cursor: pending ? "default" : "pointer",
        alignSelf: "flex-start",
      }}
    >
      {pending ? "Salvando..." : "Adicionar nota"}
    </button>
  );
}

export function NotaForm({
  action,
}: {
  action: (prevState: AdminActionResult | null, formData: FormData) => Promise<AdminActionResult>;
}) {
  const [state, formAction] = useFormState(action, initialState);
  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <textarea
        name="conteudo"
        placeholder="Ligação feita, próximo passo combinado, etc."
        rows={3}
        style={{
          padding: "9px 12px",
          borderRadius: 9,
          border: "1px solid #d2d2d7",
          fontSize: 13,
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />
      {state && !state.ok && <p style={{ color: "#d70015", fontSize: 13, margin: 0 }}>{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
