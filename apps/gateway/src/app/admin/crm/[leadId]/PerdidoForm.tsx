"use client";

import { useState } from "react";
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
        background: pending ? "#a1a1a6" : "#d70015",
        color: "#fff",
        fontSize: 13,
        fontWeight: 600,
        cursor: pending ? "default" : "pointer",
      }}
    >
      {pending ? "Salvando..." : "Confirmar perda"}
    </button>
  );
}

export function PerdidoForm({
  action,
}: {
  action: (prevState: AdminActionResult | null, formData: FormData) => Promise<AdminActionResult>;
}) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction] = useFormState(action, initialState);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        style={{
          padding: "8px 14px",
          borderRadius: 9,
          border: "1px solid #ffd7d7",
          background: "#fff",
          color: "#d70015",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Marcar como perdido
      </button>
    );
  }

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <textarea
        name="motivo"
        placeholder="Motivo da perda (obrigatório) — ex: escolheu concorrente, sem orçamento, não respondeu mais"
        rows={2}
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
      <div style={{ display: "flex", gap: 8 }}>
        <SubmitButton />
        <button
          type="button"
          onClick={() => setAberto(false)}
          style={{
            padding: "8px 14px",
            borderRadius: 9,
            border: "1px solid #d2d2d7",
            background: "#fff",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
