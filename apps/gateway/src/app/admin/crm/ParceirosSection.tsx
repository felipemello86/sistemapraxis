"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { AdminActionResult } from "../actions";

type Parceiro = { id: string; nome: string; telefone: string | null; observacao: string | null };

const initialState: AdminActionResult | null = null;

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 9,
  border: "1px solid #d2d2d7",
  fontSize: 13,
  flex: 1,
  minWidth: 140,
};

// SVG inline, mesmo padrão de IconeLixeira em KanbanBoard.tsx (sem lib de
// ícone nova) — duplicado aqui de propósito em vez de importar de lá, pra
// não criar acoplamento entre os dois arquivos por causa de um ícone.
function IconeLixeira() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

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
      {pending ? "Salvando..." : "Adicionar"}
    </button>
  );
}

// Substitui a antiga área recolhível de leads "Finalizados" (31/07/2026,
// pedido do Felipe — Finalizados virou uma coluna fixa do Kanban, ver
// KanbanBoard.tsx). Cadastro de contatos que indicam/vendem hotéis pra
// Praxis; usado pelo <select> "Parceiro" que aparece no lead quando
// fonte="Indicação" (ver [leadId]/ParceiroSelect.tsx e NovoLeadForm.tsx).
export function ParceirosSection({
  parceiros,
  criarAction,
  excluirAction,
}: {
  parceiros: Parceiro[];
  criarAction: (prevState: AdminActionResult | null, formData: FormData) => Promise<AdminActionResult>;
  excluirAction: (parceiroId: string) => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction] = useFormState(criarAction, initialState);
  // Mesmo padrão de leads em KanbanBoard.tsx: estado local otimista pra
  // exclusão instantânea na UI, ressincronizado com o servidor quando a
  // página recarrega os dados (criarParceiroAction/excluirParceiroAction
  // terminam em redirect, trazendo `parceiros` atualizado como prop nova).
  const [lista, setLista] = useState(parceiros);
  useEffect(() => setLista(parceiros), [parceiros]);

  function excluir(p: Parceiro) {
    if (
      !confirm(
        `Excluir o parceiro "${p.nome}"? Leads que já usaram ele como indicação continuam existindo, só perdem essa referência.`
      )
    ) {
      return;
    }
    setLista((prev) => prev.filter((x) => x.id !== p.id));
    void excluirAction(p.id);
  }

  return (
    <div style={{ marginTop: 16, flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          border: "none",
          background: "none",
          cursor: "pointer",
          padding: "8px 4px",
          fontSize: 13,
          fontWeight: 600,
          color: "#1d1d1f",
        }}
      >
        <span style={{ display: "inline-block", transform: aberto ? "rotate(90deg)" : "none", transition: "transform 0.1s" }}>
          ▶
        </span>
        Parceiros &amp; Vendedores ({lista.length})
      </button>

      {aberto && (
        <div style={{ background: "#f5f5f7", borderRadius: 14, padding: 12 }}>
          <form
            action={formAction}
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "flex-start",
              marginBottom: 12,
              background: "#fff",
              borderRadius: 12,
              padding: 12,
              boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
            }}
          >
            <input name="nome" placeholder="Nome do parceiro/vendedor" required style={inputStyle} />
            <input name="telefone" type="tel" placeholder="Telefone (opcional)" style={{ ...inputStyle, maxWidth: 180 }} />
            <input name="observacao" placeholder="Observação (opcional)" style={{ ...inputStyle, minWidth: 200 }} />
            <SubmitButton />
            {state && !state.ok && (
              <p style={{ color: "#d70015", fontSize: 13, margin: 0, flexBasis: "100%" }}>{state.error}</p>
            )}
          </form>

          {lista.length === 0 ? (
            <p style={{ fontSize: 12, color: "#a1a1a6", padding: "0 4px" }}>Nenhum parceiro cadastrado ainda.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
              {lista.map((p) => (
                <div
                  key={p.id}
                  style={{
                    background: "#fff",
                    borderRadius: 12,
                    padding: 12,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div style={{ minWidth: 160, flex: 1 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{p.nome}</span>
                    {p.telefone && <span style={{ fontSize: 12, color: "#6e6e73", marginLeft: 8 }}>{p.telefone}</span>}
                    {p.observacao && <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#a1a1a6" }}>{p.observacao}</p>}
                  </div>
                  <button
                    type="button"
                    title="Excluir parceiro"
                    onClick={() => excluir(p)}
                    style={{
                      border: "none",
                      background: "none",
                      color: "#a1a1a6",
                      cursor: "pointer",
                      padding: 4,
                      display: "flex",
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#d70015")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#a1a1a6")}
                  >
                    <IconeLixeira />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
