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

// Botão de lápis (editar parceiro) — mesmo espírito do IconeLixeira acima:
// SVG inline com currentColor, sem lib de ícone nova.
function IconeLapis() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
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

const botaoIconeStyle: React.CSSProperties = {
  border: "none",
  background: "none",
  cursor: "pointer",
  padding: 4,
  display: "flex",
  flexShrink: 0,
};

// Card de um parceiro, com modo de edição explícito (botão de lápis +
// Salvar/Cancelar) — mesmo padrão pedido pros leads (ver LeadInfoEditavel.tsx
// e o pedido original do Felipe: "um botão de lápis que habilite a edição e
// depois confirme ou desista"), agora replicado aqui pros cards de
// parceiro/vendedor.
function ParceiroCard({
  parceiro,
  atualizarAction,
  onExcluir,
}: {
  parceiro: Parceiro;
  atualizarAction: (parceiroId: string, dados: { nome: string; telefone: string; observacao: string }) => Promise<void>;
  onExcluir: (parceiro: Parceiro) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState(parceiro.nome);
  const [telefone, setTelefone] = useState(parceiro.telefone ?? "");
  const [observacao, setObservacao] = useState(parceiro.observacao ?? "");

  function iniciarEdicao() {
    setNome(parceiro.nome);
    setTelefone(parceiro.telefone ?? "");
    setObservacao(parceiro.observacao ?? "");
    setEditando(true);
  }

  async function salvar() {
    if (!nome.trim()) return;
    setSalvando(true);
    try {
      await atualizarAction(parceiro.id, { nome: nome.trim(), telefone: telefone.trim(), observacao: observacao.trim() });
      setEditando(false);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
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
      {!editando ? (
        <div style={{ minWidth: 160, flex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 13.5 }}>{parceiro.nome}</span>
          {parceiro.telefone && <span style={{ fontSize: 12, color: "#6e6e73", marginLeft: 8 }}>{parceiro.telefone}</span>}
          {parceiro.observacao && <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#a1a1a6" }}>{parceiro.observacao}</p>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 160 }}>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" style={inputStyle} />
          <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="Telefone (opcional)"
            type="tel"
            style={inputStyle}
          />
          <input
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Observação (opcional)"
            style={inputStyle}
          />
        </div>
      )}
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        {!editando ? (
          <>
            <button
              type="button"
              title="Editar parceiro"
              onClick={iniciarEdicao}
              style={{ ...botaoIconeStyle, color: "#6e6e73" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#1d1d1f")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#6e6e73")}
            >
              <IconeLapis />
            </button>
            <button
              type="button"
              title="Excluir parceiro"
              onClick={() => onExcluir(parceiro)}
              style={{ ...botaoIconeStyle, color: "#a1a1a6" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#d70015")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#a1a1a6")}
            >
              <IconeLixeira />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={salvar}
              disabled={salvando || !nome.trim()}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #1a7f37",
                background: "#1a7f37",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                opacity: salvando || !nome.trim() ? 0.6 : 1,
                whiteSpace: "nowrap",
              }}
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => setEditando(false)}
              disabled={salvando}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #d2d2d7",
                background: "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Cancelar
            </button>
          </>
        )}
      </div>
    </div>
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
  atualizarAction,
}: {
  parceiros: Parceiro[];
  criarAction: (prevState: AdminActionResult | null, formData: FormData) => Promise<AdminActionResult>;
  excluirAction: (parceiroId: string) => Promise<void>;
  atualizarAction: (parceiroId: string, dados: { nome: string; telefone: string; observacao: string }) => Promise<void>;
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
                <ParceiroCard key={p.id} parceiro={p} atualizarAction={atualizarAction} onExcluir={excluir} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
