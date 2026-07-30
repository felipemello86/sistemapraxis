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

const TIPO_LABEL: Record<string, string> = {
  TEXTO: "Texto",
  NUMERO: "Número",
  DATA: "Data",
  SELECAO: "Seleção",
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

type Campo = { id: string; nome: string; tipo: string; opcoes: string | null };

export function CampoCard({
  campo,
  editarAction,
  excluirAction,
}: {
  campo: Campo;
  editarAction: (
    campoId: string,
    prevState: AdminActionResult | null,
    formData: FormData
  ) => Promise<AdminActionResult>;
  excluirAction: (campoId: string) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [tipoSelecionado, setTipoSelecionado] = useState(campo.tipo);
  const boundEditar = editarAction.bind(null, campo.id);
  const [state, formAction] = useFormState(boundEditar, initialState);
  const boundExcluir = excluirAction.bind(null, campo.id);

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
          <input name="nome" defaultValue={campo.nome} placeholder="Nome do campo" required style={inputStyle} />
          <select
            name="tipo"
            defaultValue={campo.tipo}
            onChange={(e) => setTipoSelecionado(e.target.value)}
            style={{ ...inputStyle, maxWidth: 140 }}
          >
            <option value="TEXTO">Texto</option>
            <option value="NUMERO">Número</option>
            <option value="DATA">Data</option>
            <option value="SELECAO">Seleção</option>
          </select>
        </div>
        {tipoSelecionado === "SELECAO" && (
          <input
            name="opcoes"
            defaultValue={campo.opcoes ?? ""}
            placeholder="Opções separadas por vírgula (ex: Frio, Morno, Quente)"
            style={inputStyle}
          />
        )}
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
      <div>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{campo.nome}</span>{" "}
        <span style={{ fontSize: 12, color: "#6e6e73" }}>
          {TIPO_LABEL[campo.tipo] ?? campo.tipo}
          {campo.tipo === "SELECAO" && campo.opcoes ? ` (${campo.opcoes})` : ""}
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
            if (!confirm(`Excluir o campo "${campo.nome}"? Os valores preenchidos pra ele em todos os leads somem junto.`)) {
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
