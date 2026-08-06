"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { VendasActionResult } from "./actions";
import { FONTE_OPCOES } from "../../admin/crm/fonteOpcoes";

const initialState: VendasActionResult | null = null;

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 9,
  border: "1px solid #d2d2d7",
  fontSize: 13,
  flex: 1,
  minWidth: 160,
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
      {pending ? "Salvando..." : "Criar lead"}
    </button>
  );
}

// Versão do NovoLeadForm do CRM do admin (../../admin/crm/NovoLeadForm.tsx)
// adaptada pro módulo Vendas do tenant: "empresa" é opcional (nem todo lead
// de um hotel é uma empresa, pode ser um hóspede pessoa física) e não tem
// campo de Parceiro (isso é específico do CRM de vendas da própria Praxis).
export function NovoLeadForm({
  action,
}: {
  action: (prevState: VendasActionResult | null, formData: FormData) => Promise<VendasActionResult>;
}) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction] = useFormState(action, initialState);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        style={{
          padding: "7px 13px",
          borderRadius: 9,
          border: "none",
          background: "#1d1d1f",
          color: "#fff",
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        + Novo lead
      </button>
    );
  }

  return (
    <form
      action={formAction}
      style={{
        background: "#fff",
        borderRadius: 14,
        padding: 16,
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        marginBottom: 16,
        flexBasis: "100%",
      }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input name="nome" placeholder="Nome do contato" required style={inputStyle} />
        <input name="empresa" placeholder="Empresa (opcional)" style={inputStyle} />
        <input name="telefone" type="tel" placeholder="Telefone com DDD, ex: (81) 98952-6361" required style={inputStyle} />
        <input name="email" placeholder="E-mail (opcional)" style={inputStyle} />
        <input
          name="valor"
          type="number"
          min={0}
          step="0.01"
          placeholder="Valor (R$)"
          style={{ ...inputStyle, minWidth: 120, maxWidth: 140 }}
        />
        <select name="fonte" required defaultValue="" style={{ ...inputStyle, maxWidth: 160 }}>
          <option value="" disabled>
            Fonte...
          </option>
          {FONTE_OPCOES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>
      <textarea
        name="mensagem"
        placeholder="Observação inicial (opcional)"
        rows={2}
        style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #d2d2d7", fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
      />
      {state && !state.ok && <p style={{ color: "#d70015", fontSize: 13, margin: 0 }}>{state.error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <SubmitButton />
        <button
          type="button"
          onClick={() => setAberto(false)}
          style={{
            padding: "9px 16px",
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
