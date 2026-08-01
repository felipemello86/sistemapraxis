"use client";

// SVGs inline, mesmo padrão/traçado de KanbanBoard.tsx (duplicados aqui de
// propósito, mesmo motivo do IconeLixeira em ParceirosSection.tsx: evitar
// acoplar dois arquivos por causa de um ícone).
function IconeGanho({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.25 12.5 2.5 2.5 5-5.5" />
    </svg>
  );
}

function IconePerdido({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="m9.5 9.5 5 5M14.5 9.5l-5 5" />
    </svg>
  );
}

function IconeLixeira() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

const botaoIconeStyle: React.CSSProperties = {
  border: "none",
  background: "none",
  cursor: "pointer",
  padding: 2,
  display: "flex",
};

// Repete os 3 ícones do card do Kanban (ganho/perdido/excluir — ver
// KanbanBoard.tsx) na tela de detalhe (31/07/2026, pedido do Felipe),
// substituindo os antigos botões com texto ("✅ Marcar ganho", "Marcar como
// perdido", "Excluir lead") que ficavam embaixo, perto de Valor/Fonte.
// Ganho/excluir chamam a action direto (mesmo padrão de EtapaSelect etc.);
// perdido usa prompt() pro motivo, igual ao atalho ❌ do board (em vez do
// PerdidoForm com textarea que existia antes só aqui). Quando o lead já
// está finalizado (GANHO/PERDIDO), os 2 ícones viram um botão "Reabrir" —
// mesmo comportamento condicional que já existia com os botões de texto.
export function LeadAcoesIcones({
  hotelNome,
  desfecho,
  marcarGanho,
  marcarPerdido,
  reabrir,
  excluir,
}: {
  hotelNome: string;
  desfecho: "ABERTO" | "GANHO" | "PERDIDO";
  marcarGanho: () => Promise<void>;
  marcarPerdido: (motivo: string) => Promise<void>;
  reabrir: () => Promise<void>;
  excluir: () => Promise<void>;
}) {
  function onPerdido() {
    const motivo = prompt(`Motivo da perda de "${hotelNome}" (opcional, Cancelar desiste):`);
    if (motivo === null) return; // clicou Cancelar — não marca nada
    void marcarPerdido(motivo);
  }

  function onExcluir() {
    if (
      !confirm(`Excluir o lead "${hotelNome}"? Isso apaga o histórico e os campos personalizados dele também. Não tem como desfazer.`)
    ) {
      return;
    }
    void excluir();
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {desfecho === "ABERTO" ? (
        <>
          <button type="button" title="Marcar como ganho" onClick={() => void marcarGanho()} style={{ ...botaoIconeStyle, color: "#1a7f37" }}>
            <IconeGanho />
          </button>
          <button type="button" title="Marcar como perdido" onClick={onPerdido} style={{ ...botaoIconeStyle, color: "#d70015" }}>
            <IconePerdido />
          </button>
        </>
      ) : (
        <button
          type="button"
          title="Reabrir (volta pro funil)"
          onClick={() => void reabrir()}
          style={{
            border: "1px solid #d2d2d7",
            borderRadius: 7,
            background: "#fff",
            color: "#1d1d1f",
            cursor: "pointer",
            padding: "3px 8px",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          ↩ Reabrir
        </button>
      )}
      <button
        type="button"
        title="Excluir lead"
        onClick={onExcluir}
        style={{ ...botaoIconeStyle, color: "#a1a1a6" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#d70015")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#a1a1a6")}
      >
        <IconeLixeira />
      </button>
    </div>
  );
}
