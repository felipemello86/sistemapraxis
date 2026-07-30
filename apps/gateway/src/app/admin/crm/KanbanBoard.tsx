"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatValorBRL, formatValorBRLCompacto } from "./valorFormat";
import { tocarSomGanho } from "./somSucesso";

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

type Etapa = { id: string; nome: string };
type Lead = {
  id: string;
  hotel: string;
  nome: string;
  stageId: string | null;
  desfecho: "ABERTO" | "GANHO" | "PERDIDO";
  motivoPerda: string | null;
  valor: number;
};

// Paleta cíclica de cores das colunas (30/07/2026) — ganho/perdido não são
// mais etapas especiais (ver PipelineStage no schema), então toda coluna
// usa a mesma paleta, sem verde/cinza reservado.
const PALETA_ETAPAS = ["#F2C94C", "#BB6BD9", "#2F80ED", "#56CCF2", "#F2994A", "#EB5757", "#9B51E0"];

// Board com clique-e-arraste (30/07/2026, pedido do Felipe — antes cada
// card tinha um <select> de etapa). Drag-and-drop nativo do HTML5 (sem lib
// nova: baixo volume de leads/colunas não justifica trazer uma dependência
// só pra isso, e evitar dependência nova evita o passo extra de rodar
// `pnpm install` e commitar o lockfile). Atualiza a UI otimisticamente e
// dispara moverEtapaAction em paralelo — o mesmo server action que o antigo
// <select> já usava, então o comportamento de permissão/histórico
// (LeadActivity) continua idêntico.
//
// Ganho/perdido (30/07/2026, 2ª rodada): não são mais colunas — um lead
// marcado ✅/❌ continua na mesma etapa, só sai da visão normal do board e
// vai pra área recolhível "Finalizados" no rodapé (filtrável por
// ganho/perdido/todos). Reabrir devolve ele pro board normal, na mesma
// coluna de sempre.
export function KanbanBoard({
  etapas,
  leadsIniciais,
  moverEtapaAction,
  excluirLeadAction,
  marcarGanhoAction,
  marcarPerdidoRapidoAction,
  reabrirLeadAction,
}: {
  etapas: Etapa[];
  leadsIniciais: Lead[];
  moverEtapaAction: (leadId: string, novaEtapaId: string) => Promise<void>;
  excluirLeadAction: (leadId: string) => Promise<void>;
  marcarGanhoAction: (leadId: string) => Promise<void>;
  marcarPerdidoRapidoAction: (leadId: string, motivo: string) => Promise<void>;
  reabrirLeadAction: (leadId: string) => Promise<void>;
}) {
  const [leads, setLeads] = useState(leadsIniciais);
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  const [sobreEtapaId, setSobreEtapaId] = useState<string | null>(null);
  const [mostrarFinalizados, setMostrarFinalizados] = useState(false);
  const [filtroFinalizados, setFiltroFinalizados] = useState<"TODOS" | "GANHO" | "PERDIDO">("TODOS");

  // Ressincroniza com o servidor sempre que a página recarrega os dados
  // (ex: moverEtapaAction termina com redirect("/admin/crm"), que traz
  // props novas) — sem isso, o estado local otimista nunca seria corrigido
  // se o servidor recusasse a mudança por algum motivo.
  useEffect(() => {
    setLeads(leadsIniciais);
  }, [leadsIniciais]);

  const nomeEtapa = new Map(etapas.map((e) => [e.id, e.nome]));
  const leadsAbertos = leads.filter((l) => l.desfecho === "ABERTO");
  const leadsFinalizados = leads
    .filter((l) => l.desfecho !== "ABERTO")
    .filter((l) => filtroFinalizados === "TODOS" || l.desfecho === filtroFinalizados);

  const leadsPorEtapa = new Map<string, Lead[]>();
  for (const etapa of etapas) leadsPorEtapa.set(etapa.id, []);
  for (const lead of leadsAbertos) {
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
    tocarSomGanho();
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, desfecho: "GANHO", motivoPerda: null } : l)));
    void marcarGanhoAction(lead.id);
  }

  function marcarPerdido(lead: Lead) {
    const motivo = prompt(`Motivo da perda de "${lead.hotel}" (opcional, Cancelar desiste):`);
    if (motivo === null) return; // usuário clicou Cancelar — não marca nada
    setLeads((prev) =>
      prev.map((l) => (l.id === lead.id ? { ...l, desfecho: "PERDIDO", motivoPerda: motivo.trim() || "Não informado" } : l))
    );
    void marcarPerdidoRapidoAction(lead.id, motivo);
  }

  function reabrir(lead: Lead) {
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, desfecho: "ABERTO", motivoPerda: null } : l)));
    void reabrirLeadAction(lead.id);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 12, flex: 1, minHeight: 0 }}>
        {etapas.map((etapa, index) => {
          const leadsDaEtapa = leadsPorEtapa.get(etapa.id) ?? [];
          const somaValores = leadsDaEtapa.reduce((soma, l) => soma + l.valor, 0);
          const corBarra = PALETA_ETAPAS[index % PALETA_ETAPAS.length];
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
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                transition: "background 0.1s, border-color 0.1s",
              }}
            >
              <div style={{ padding: "0 4px", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#1d1d1f" }}>{etapa.nome}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 11.5, color: "#6e6e73", fontWeight: 600 }}>
                      {formatValorBRLCompacto(somaValores)}
                    </span>
                    <span style={{ fontSize: 12, color: "#6e6e73", fontWeight: 600 }}>{leadsDaEtapa.length}</span>
                  </span>
                </div>
                <div style={{ height: 3, borderRadius: 999, background: corBarra, marginTop: 8 }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", minHeight: 0, flex: 1 }}>
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
                        {lead.valor > 0 && (
                          <div style={{ fontSize: 12, color: "#1a7f37", fontWeight: 700, marginTop: 2 }}>
                            {formatValorBRL(lead.valor)}
                          </div>
                        )}
                      </Link>
                      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                        <button
                          type="button"
                          title="Marcar como ganho"
                          onClick={() => marcarGanho(lead)}
                          style={{ border: "none", background: "none", cursor: "pointer", padding: 2, fontSize: 13, lineHeight: 1 }}
                        >
                          ✅
                        </button>
                        <button
                          type="button"
                          title="Marcar como perdido"
                          onClick={() => marcarPerdido(lead)}
                          style={{ border: "none", background: "none", cursor: "pointer", padding: 2, fontSize: 13, lineHeight: 1 }}
                        >
                          ❌
                        </button>
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
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 16, flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setMostrarFinalizados((v) => !v)}
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
          <span style={{ display: "inline-block", transform: mostrarFinalizados ? "rotate(90deg)" : "none", transition: "transform 0.1s" }}>
            ▶
          </span>
          Finalizados ({leads.filter((l) => l.desfecho !== "ABERTO").length})
        </button>

        {mostrarFinalizados && (
          <div style={{ background: "#f5f5f7", borderRadius: 14, padding: 12 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {(["TODOS", "GANHO", "PERDIDO"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFiltroFinalizados(f)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 999,
                    border: filtroFinalizados === f ? "1px solid #1d1d1f" : "1px solid #d2d2d7",
                    background: filtroFinalizados === f ? "#1d1d1f" : "#fff",
                    color: filtroFinalizados === f ? "#fff" : "#1d1d1f",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {f === "TODOS" ? "Todos" : f === "GANHO" ? "Ganhos" : "Perdidos"}
                </button>
              ))}
            </div>

            {leadsFinalizados.length === 0 ? (
              <p style={{ fontSize: 12, color: "#a1a1a6", padding: "0 4px" }}>Nenhum lead finalizado aqui.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
                {leadsFinalizados.map((lead) => (
                  <div
                    key={lead.id}
                    style={{
                      background: "#fff",
                      borderRadius: 12,
                      padding: 12,
                      boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 200, flex: 1 }}>
                      <Link href={`/admin/crm/${lead.id}`} style={{ textDecoration: "none", color: "#1d1d1f" }}>
                        <span style={{ fontWeight: 700, fontSize: 13.5 }}>{lead.hotel}</span>{" "}
                        <span style={{ fontSize: 12, color: "#6e6e73" }}>{lead.nome}</span>
                      </Link>
                      <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#a1a1a6" }}>
                        {lead.stageId ? nomeEtapa.get(lead.stageId) ?? "—" : "—"}
                        {lead.desfecho === "PERDIDO" && lead.motivoPerda ? ` · “${lead.motivoPerda}”` : ""}
                      </p>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 9px",
                        borderRadius: 999,
                        color: lead.desfecho === "GANHO" ? "#1a7f37" : "#d70015",
                        background: lead.desfecho === "GANHO" ? "#1a7f371a" : "#d700151a",
                        flexShrink: 0,
                      }}
                    >
                      {lead.desfecho === "GANHO" ? "✅ Ganho" : "❌ Perdido"}
                    </span>
                    <button
                      type="button"
                      onClick={() => reabrir(lead)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 8,
                        border: "1px solid #d2d2d7",
                        background: "#fff",
                        fontSize: 12,
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      Reabrir
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
