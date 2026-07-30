"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// SVG inline em vez de lucide-react (ou outra lib de ícone) — apps/gateway
// não tem nenhuma lib de ícones instalada, e trazer uma só pra este botão
// exigiria rodar pnpm install e commitar o lockfile à toa.
function IconeLixeira() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

type Etapa = { id: string; nome: string; ehGanho: boolean; ehPerdido: boolean };
type Lead = {
  id: string;
  hotel: string;
  nome: string;
  stageId: string | null;
  motivoPerda: string | null;
};

// Mesma paleta de ../crm/page.tsx (30/07/2026) — mantida aqui porque este
// componente já é client-only (precisa ser, pra drag-and-drop) e a página
// que o chama é Server Component, então não dá pra só importar uma função
// daqui pra lá sem virar um import client->server inválido.
const PALETA_ETAPAS = ["#F2C94C", "#BB6BD9", "#2F80ED", "#56CCF2", "#F2994A", "#EB5757", "#9B51E0"];

function corDaEtapa(etapa: Etapa, index: number): string {
  if (etapa.ehGanho) return "#27AE60";
  if (etapa.ehPerdido) return "#828282";
  return PALETA_ETAPAS[index % PALETA_ETAPAS.length];
}

// Board com clique-e-arraste (30/07/2026, pedido do Felipe — antes cada
// card tinha um <select> de etapa). Drag-and-drop nativo do HTML5 (sem lib
// nova: baixo volume de leads/colunas não justifica trazer uma dependência
// só pra isso, e evitar dependência nova evita o passo extra de rodar
// `pnpm install` e commitar o lockfile). Atualiza a UI otimisticamente e
// dispara moverEtapaAction em paralelo — o mesmo server action que o antigo
// <select> já usava, então o comportamento de permissão/histórico
// (LeadActivity) continua idêntico.
export function KanbanBoard({
  etapas,
  leadsIniciais,
  moverEtapaAction,
  excluirLeadAction,
  marcarGanhoAction,
  marcarPerdidoRapidoAction,
}: {
  etapas: Etapa[];
  leadsIniciais: Lead[];
  moverEtapaAction: (leadId: string, novaEtapaId: string) => Promise<void>;
  excluirLeadAction: (leadId: string) => Promise<void>;
  marcarGanhoAction: (leadId: string) => Promise<void>;
  marcarPerdidoRapidoAction: (leadId: string, motivo: string) => Promise<void>;
}) {
  const etapaGanho = etapas.find((e) => e.ehGanho);
  const etapaPerdido = etapas.find((e) => e.ehPerdido);
  const [leads, setLeads] = useState(leadsIniciais);
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  const [sobreEtapaId, setSobreEtapaId] = useState<string | null>(null);

  // Ressincroniza com o servidor sempre que a página recarrega os dados
  // (ex: moverEtapaAction termina com redirect("/admin/crm"), que traz
  // props novas) — sem isso, o estado local otimista nunca seria corrigido
  // se o servidor recusasse a mudança por algum motivo.
  useEffect(() => {
    setLeads(leadsIniciais);
  }, [leadsIniciais]);

  const leadsPorEtapa = new Map<string, Lead[]>();
  for (const etapa of etapas) leadsPorEtapa.set(etapa.id, []);
  for (const lead of leads) {
    if (lead.stageId && leadsPorEtapa.has(lead.stageId)) leadsPorEtapa.get(lead.stageId)!.push(lead);
  }

  function soltar(etapaId: string) {
    if (!arrastandoId) return;
    const leadId = arrastandoId;
    setArrastandoId(null);
    setSobreEtapaId(null);
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stageId: etapaId } : l)));
    void moverEtapaAction(leadId, etapaId);
  }

  function excluir(lead: Lead) {
    if (!confirm(`Excluir o lead "${lead.hotel}"? Isso apaga o histórico e os campos personalizados dele também. Não tem como desfazer.`)) {
      return;
    }
    setLeads((prev) => prev.filter((l) => l.id !== lead.id));
    void excluirLeadAction(lead.id);
  }

  function marcarGanho(lead: Lead) {
    if (!etapaGanho) return;
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, stageId: etapaGanho.id, motivoPerda: null } : l)));
    void marcarGanhoAction(lead.id);
  }

  function marcarPerdido(lead: Lead) {
    if (!etapaPerdido) return;
    const motivo = prompt(`Motivo da perda de "${lead.hotel}" (opcional, Cancelar desiste):`);
    if (motivo === null) return; // usuário clicou Cancelar — não marca nada
    setLeads((prev) =>
      prev.map((l) => (l.id === lead.id ? { ...l, stageId: etapaPerdido.id, motivoPerda: motivo.trim() || "Não informado" } : l))
    );
    void marcarPerdidoRapidoAction(lead.id, motivo);
  }

  return (
    <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 12 }}>
      {etapas.map((etapa, index) => {
        const leadsDaEtapa = leadsPorEtapa.get(etapa.id) ?? [];
        const corBarra = corDaEtapa(etapa, index);
        const emFoco = sobreEtapaId === etapa.id;
        return (
          <div
            key={etapa.id}
            onDragOver={(e) => {
              e.preventDefault();
              if (sobreEtapaId !== etapa.id) setSobreEtapaId(etapa.id);
            }}
            onDragLeave={() => setSobreEtapaId((atual) => (atual === etapa.id ? null : atual))}
            onDrop={(e) => {
              e.preventDefault();
              soltar(etapa.id);
            }}
            style={{
              flex: "0 0 280px",
              background: emFoco ? "#eef4ff" : "#f5f5f7",
              border: emFoco ? "1px dashed #0071e3" : "1px solid transparent",
              borderRadius: 14,
              padding: 12,
              maxHeight: "calc(100svh - 220px)",
              display: "flex",
              flexDirection: "column",
              transition: "background 0.1s, border-color 0.1s",
            }}
          >
            <div style={{ padding: "0 4px", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: "#1d1d1f" }}>{etapa.nome}</span>
                <span style={{ fontSize: 12, color: "#6e6e73", fontWeight: 600 }}>{leadsDaEtapa.length}</span>
              </div>
              <div style={{ height: 3, borderRadius: 999, background: corBarra, marginTop: 8 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
              {leadsDaEtapa.length === 0 && (
                <p style={{ fontSize: 12, color: "#a1a1a6", padding: "0 4px" }}>
                  {emFoco ? "Solte aqui" : "Nenhum lead aqui."}
                </p>
              )}
              {leadsDaEtapa.map((lead) => (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    setArrastandoId(lead.id);
                  }}
                  onDragEnd={() => {
                    setArrastandoId(null);
                    setSobreEtapaId(null);
                  }}
                  style={{
                    background: "#fff",
                    borderRadius: 12,
                    padding: 12,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    cursor: "grab",
                    opacity: arrastandoId === lead.id ? 0.4 : 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                    <Link href={`/admin/crm/${lead.id}`} style={{ textDecoration: "none", color: "#1d1d1f", flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{lead.hotel}</div>
                      <div style={{ fontSize: 12, color: "#6e6e73" }}>{lead.nome}</div>
                    </Link>
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      {!etapa.ehGanho && etapaGanho && (
                        <button
                          type="button"
                          title="Marcar como ganho"
                          onClick={() => marcarGanho(lead)}
                          style={{ border: "none", background: "none", cursor: "pointer", padding: 2, fontSize: 13, lineHeight: 1 }}
                        >
                          ✅
                        </button>
                      )}
                      {!etapa.ehPerdido && etapaPerdido && (
                        <button
                          type="button"
                          title="Marcar como perdido"
                          onClick={() => marcarPerdido(lead)}
                          style={{ border: "none", background: "none", cursor: "pointer", padding: 2, fontSize: 13, lineHeight: 1 }}
                        >
                          ❌
                        </button>
                      )}
                      <button
                        type="button"
                        title="Excluir lead"
                        onClick={() => excluir(lead)}
                        style={{
                          border: "none",
                          background: "none",
                          color: "#a1a1a6",
                          cursor: "pointer",
                          padding: 2,
                          display: "flex",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "#d70015")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "#a1a1a6")}
                      >
                        <IconeLixeira />
                      </button>
                    </div>
                  </div>
                  {etapa.ehPerdido && lead.motivoPerda && (
                    <p style={{ fontSize: 11.5, color: "#8e8e93", margin: 0, fontStyle: "italic" }}>
                      “{lead.motivoPerda}”
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
