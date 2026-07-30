"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { AdminActionResult } from "../../actions";

const initialState: AdminActionResult | null = null;

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 9,
  border: "1px solid #d2d2d7",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
};

function SalvarButton() {
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
      {pending ? "Salvando..." : "Salvar campos"}
    </button>
  );
}

type Campo = { id: string; nome: string; tipo: string; opcoes: string | null };

// Um form só com todos os campos personalizados do lead — mais simples que
// um botão de salvar por campo, dado o volume baixo. Ver salvarCamposLeadAction
// (../../actions.ts): lê uma chave `campo_<id>` por campo, upsert de cada um.
export function CamposPersonalizadosForm({
  campos,
  valores,
  action,
}: {
  campos: Campo[];
  valores: Record<string, string>;
  action: (prevState: AdminActionResult | null, formData: FormData) => Promise<AdminActionResult>;
}) {
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {campos.map((campo) => {
        const nomeInput = `campo_${campo.id}`;
        const valorAtual = valores[campo.id] ?? "";
        return (
          <label key={campo.id} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "#6e6e73" }}>
            {campo.nome}
            {campo.tipo === "SELECAO" ? (
              <select name={nomeInput} defaultValue={valorAtual} style={inputStyle}>
                <option value="">—</option>
                {(campo.opcoes ?? "")
                  .split(",")
                  .map((o) => o.trim())
                  .filter(Boolean)
                  .map((opcao) => (
                    <option key={opcao} value={opcao}>
                      {opcao}
                    </option>
                  ))}
              </select>
            ) : (
              <input
                name={nomeInput}
                type={campo.tipo === "NUMERO" ? "number" : campo.tipo === "DATA" ? "date" : "text"}
                defaultValue={valorAtual}
                style={inputStyle}
              />
            )}
          </label>
        );
      })}
      {state && !state.ok && <p style={{ color: "#d70015", fontSize: 13, margin: 0 }}>{state.error}</p>}
      <SalvarButton />
    </form>
  );
}
