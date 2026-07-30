"use client";

import { useState } from "react";
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
      {pending ? "Salvando..." : "Adicionar campo"}
    </button>
  );
}

export function NovoCampoForm({
  action,
}: {
  action: (prevState: AdminActionResult | null, formData: FormData) => Promise<AdminActionResult>;
}) {
  const [state, formAction] = useFormState(action, initialState);
  const [tipo, setTipo] = useState("TEXTO");

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input name="nome" placeholder="Nome do campo (ex: Nº de UHs)" required style={inputStyle} />
        <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ ...inputStyle, maxWidth: 140 }}>
          <option value="TEXTO">Texto</option>
          <option value="NUMERO">Número</option>
          <option value="DATA">Data</option>
          <option value="SELECAO">Seleção</option>
        </select>
      </div>
      {tipo === "SELECAO" && (
        <input name="opcoes" placeholder="Opções separadas por vírgula (ex: Frio, Morno, Quente)" style={inputStyle} />
      )}
      {state && !state.ok && <p style={{ color: "#d70015", fontSize: 13, margin: 0 }}>{state.error}</p>}
      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
