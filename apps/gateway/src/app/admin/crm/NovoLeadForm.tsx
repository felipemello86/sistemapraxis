"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { AdminActionResult } from "../actions";
import { FONTE_OPCOES } from "./fonteOpcoes";

const initialState: AdminActionResult | null = null;

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

// Botão "+ Novo lead" que abre um form inline — pra contatos que não vieram
// pelo formulário público (telefone, indicação, evento etc). Ver
// criarLeadManualAction em ../actions.ts.
export function NovoLeadForm({
  action,
  parceiros,
}: {
  action: (prevState: AdminActionResult | null, formData: FormData) => Promise<AdminActionResult>;
  // Lista de parceiros/vendedores cadastrados (ver ParceirosSection.tsx) —
  // só usada pro <select> "Parceiro", que só aparece quando a Fonte
  // escolhida é "Indicação" (pedido do Felipe, 31/07/2026).
  parceiros: Array<{ id: string; nome: string }>;
}) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction] = useFormState(action, initialState);
  // Controlado (em vez do <select> solto de antes) só pra decidir se mostra
  // o campo Parceiro — o valor em si ainda viaja pro server via FormData
  // normal (name="fonte"), sem passar por esse state.
  const [fonte, setFonte] = useState("");

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
        // Formulário mora dentro da linha de cabeçalho junto com "Gerenciar
        // campos"/"Gerenciar etapas" (30/07/2026) — sem isso, o flexbox
        // tenta espremer o form numa coluna estreita ao lado dos outros
        // botões em vez de quebrar pra própria linha inteira.
        flexBasis: "100%",
      }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input name="nome" placeholder="Nome do contato" required style={inputStyle} />
        <input name="hotel" placeholder="Nome do hotel" required style={inputStyle} />
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
        <select
          name="fonte"
          required
          defaultValue=""
          onChange={(e) => setFonte(e.target.value)}
          style={{ ...inputStyle, maxWidth: 160 }}
        >
          <option value="" disabled>
            Fonte...
          </option>
          {FONTE_OPCOES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        {fonte === "Indicação" && (
          <select name="parceiroId" defaultValue="" style={{ ...inputStyle, maxWidth: 200 }}>
            <option value="">Parceiro (opcional)</option>
            {parceiros.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        )}
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
