"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { AdminActionResult } from "./actions";

const initialState: AdminActionResult | null = null;

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 9,
  border: "1px solid #d2d2d7",
  fontSize: 13,
  flex: 1,
  minWidth: 140,
};

function SalvarButton() {
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
      {pending ? "Salvando..." : "Salvar"}
    </button>
  );
}

type Plano = {
  id: string;
  nome: string;
  stripePriceId: string;
  valorCentavos: number;
  intervalo: string;
};

export function EditarPlanoForm({
  plano,
  atualizarAction,
  excluirAction,
}: {
  plano: Plano;
  atualizarAction: (
    planId: string,
    prevState: AdminActionResult | null,
    formData: FormData
  ) => Promise<AdminActionResult>;
  excluirAction: (planId: string) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const boundAtualizar = atualizarAction.bind(null, plano.id);
  const [state, formAction] = useFormState(boundAtualizar, initialState);
  const boundExcluir = excluirAction.bind(null, plano.id);

  if (!editando) {
    return (
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 14,
          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 13,
          gap: 12,
        }}
      >
        <div>
          <span style={{ fontWeight: 600 }}>{plano.nome}</span>{" "}
          <span style={{ color: "#6e6e73" }}>
            R$ {(plano.valorCentavos / 100).toFixed(2)} / {plano.intervalo === "YEAR" ? "ano" : "mês"} ·{" "}
            {plano.stripePriceId}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setEditando(true)}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid #d2d2d7",
              background: "#fff",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Editar
          </button>
          <form
            action={boundExcluir}
            onSubmit={(e) => {
              if (!confirm(`Excluir o plano "${plano.nome}"? Ele deixa de aparecer na lista e não poderá mais ser selecionado em novos checkouts.`)) {
                e.preventDefault();
              }
            }}
          >
            <button
              type="submit"
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid #ffd7d7",
                background: "#fff",
                color: "#d70015",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Excluir
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: 14,
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input name="nome" defaultValue={plano.nome} placeholder="Nome do plano" required style={inputStyle} />
        <input
          name="stripePriceId"
          defaultValue={plano.stripePriceId}
          placeholder="Price ID do Stripe (price_...)"
          required
          style={inputStyle}
        />
        <input
          name="valorReais"
          defaultValue={(plano.valorCentavos / 100).toFixed(2)}
          placeholder="Valor em R$"
          required
          style={{ ...inputStyle, maxWidth: 140 }}
        />
        <select name="intervalo" defaultValue={plano.intervalo} style={{ ...inputStyle, maxWidth: 120 }}>
          <option value="MONTH">Mensal</option>
          <option value="YEAR">Anual</option>
        </select>
      </div>
      {state && !state.ok && <p style={{ color: "#d70015", fontSize: 13, margin: 0 }}>{state.error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <SalvarButton />
        <button
          type="button"
          onClick={() => setEditando(false)}
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
