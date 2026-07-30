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
      }}
    >
      {pending ? "Salvando..." : "Salvar"}
    </button>
  );
}

function ExcluirButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        padding: "6px 12px",
        borderRadius: 8,
        border: "1px solid #ffd7d7",
        background: "#fff",
        color: "#d70015",
        fontSize: 12,
        cursor: pending ? "default" : "pointer",
      }}
    >
      Excluir
    </button>
  );
}

type Etapa = { id: string; nome: string; ordem: number };

export function EtapaCard({
  etapa,
  qtdLeads,
  isPrimeira,
  isUltima,
  renomearAction,
  moverOrdemAction,
  excluirAction,
}: {
  etapa: Etapa;
  qtdLeads: number;
  isPrimeira: boolean;
  isUltima: boolean;
  renomearAction: (
    stageId: string,
    prevState: AdminActionResult | null,
    formData: FormData
  ) => Promise<AdminActionResult>;
  moverOrdemAction: (stageId: string, direcao: "up" | "down") => Promise<void>;
  excluirAction: (
    stageId: string,
    prevState: AdminActionResult | null,
    formData: FormData
  ) => Promise<AdminActionResult>;
}) {
  const [editando, setEditando] = useState(false);
  const boundRenomear = renomearAction.bind(null, etapa.id);
  const [state, formAction] = useFormState(boundRenomear, initialState);
  const boundExcluir = excluirAction.bind(null, etapa.id);
  const [excluirState, excluirFormAction] = useFormState(boundExcluir, initialState);
  const boundSubir = moverOrdemAction.bind(null, etapa.id, "up");
  const boundDescer = moverOrdemAction.bind(null, etapa.id, "down");

  if (editando) {
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
          <input name="nome" defaultValue={etapa.nome} placeholder="Nome da etapa" required style={inputStyle} />
        </div>
        {state && !state.ok && <p style={{ color: "#d70015", fontSize: 13, margin: 0 }}>{state.error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <SalvarButton />
          <button
            type="button"
            onClick={() => setEditando(false)}
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
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <form action={boundSubir}>
            <button
              type="submit"
              disabled={isPrimeira}
              style={{
                border: "none",
                background: "none",
                cursor: isPrimeira ? "default" : "pointer",
                color: isPrimeira ? "#d2d2d7" : "#1d1d1f",
                fontSize: 12,
                lineHeight: 1,
                padding: 2,
              }}
            >
              ▲
            </button>
          </form>
          <form action={boundDescer}>
            <button
              type="submit"
              disabled={isUltima}
              style={{
                border: "none",
                background: "none",
                cursor: isUltima ? "default" : "pointer",
                color: isUltima ? "#d2d2d7" : "#1d1d1f",
                fontSize: 12,
                lineHeight: 1,
                padding: 2,
              }}
            >
              ▼
            </button>
          </form>
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{etapa.nome}</span>
          </div>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6e6e73" }}>{qtdLeads} lead(s) nesta etapa</p>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {excluirState && !excluirState.ok && (
          <span style={{ fontSize: 12, color: "#d70015" }}>{excluirState.error}</span>
        )}
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
          action={excluirFormAction}
          onSubmit={(e) => {
            if (!confirm(`Excluir a etapa "${etapa.nome}"?`)) e.preventDefault();
          }}
        >
          <ExcluirButton />
        </form>
      </div>
    </div>
  );
}
