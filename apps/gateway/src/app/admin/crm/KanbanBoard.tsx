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

// Pedido do Felipe (31/07/2026): trocar os emojis ✅/❌ dos botões rápidos de
// ganho/perdido por ícones "mais bem elaborados", mantendo cor — mesmo
// padrão do IconeLixeira acima (SVG inline com currentColor, sem lib nova).
// A cor de cada um fica no `color` do <button> que o envolve, não fixa aqui.
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

type Etapa = { id: string; nome: string };
// titulo/subtitulo em vez de hotel/nome (06/08/2026) — componente virou
// reaproveitado pelo módulo Vendas do tenant também (ver linkBase acima),
// que não tem o conceito de "hotel" (o lead lá pode ser um hóspede pessoa
// física, sem empresa). Cada chamador mapeia seu model pro shape genérico:
// admin/crm usa hotel→titulo e nome→subtitulo; vendas usa nome→titulo e
// empresa→subtitulo.
type Lead = {
  id: string;
  titulo: string;
  subtitulo: string;
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
// Ganho/perdido (31/07/2026, 3ª rodada, pedido do Felipe): em vez de sumir
// pra uma área recolhível embaixo do board, um lead marcado ✅/❌ agora vai
// pra uma coluna "Finalizados" FIXA, sempre por último na linha de colunas —
// diferente das etapas de verdade (PipelineStage), não é editável/excluível
// em "Gerenciar etapas" porque simplesmente não é uma PipelineStage, é
// hardcoded aqui. Sem drag-and-drop pra dentro dela (sem onDragOver/onDrop
// nessa coluna) — o único jeito de finalizar um lead continua sendo os
// botões ✅/❌ do card (evita a ambiguidade de "virou ganho ou perdido?" ao
// simplesmente soltar um card lá). Reabrir devolve o lead pro board normal,
// na mesma coluna/etapa de sempre (marcarDesfecho nunca mexe em stageId).
export function KanbanBoard({
  etapas,
  leadsIniciais,
  moverEtapaAction,
  excluirLeadAction,
  marcarGanhoAction,
  marcarPerdidoRapidoAction,
  reabrirLeadAction,
  linkBase = "/admin/crm",
}: {
  etapas: Etapa[];
  leadsIniciais: Lead[];
  moverEtapaAction: (leadId: string, novaEtapaId: string) => Promise<void>;
  excluirLeadAction: (leadId: string) => Promise<void>;
  marcarGanhoAction: (leadId: string) => Promise<void>;
  marcarPerdidoRapidoAction: (leadId: string, motivo: string) => Promise<void>;
  reabrirLeadAction: (leadId: string) => Promise<void>;
  // Base do link de cada card (06/08/2026) — componente agora é
  // reaproveitado também pelo módulo Vendas do tenant
  // ([cliente]/vendas/page.tsx), que precisa apontar pra
  // /:cliente/vendas/:leadId em vez de /admin/crm/:leadId. Default mantém
  // o comportamento antigo do admin sem precisar tocar na chamada de lá.
  linkBase?: string;
}) {
  const [leads, setLeads] = useState(leadsIniciais);
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);
  const [sobreEtapaId, setSobreEtapaId] = useState<string | null>(null);
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
    if (!confirm(`Excluir o lead "${lead.titulo}"? Isso apaga o histórico e os campos personalizados dele também. Não tem como desfazer.`)) {
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
    const motivo = prompt(`Motivo da perda de "${lead.titulo}" (opcional, Cancelar desiste):`);
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
    <div>
      {/* alignItems no default (stretch) — colunas ficam com altura
          uniforme entre si (visual normal de kanban), até o teto de
          maxHeight abaixo. Sem flex:1 aqui: a linha só cresce até a altura
          do próprio conteúdo (a maior coluna), não até preencher o espaço
          inteiro da tela. */}
      <div style={{ display: "flex", gap: 10, overflowX: "auto", overflowY: "hidden", paddingBottom: 12, maxHeight: "62vh" }}>
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
                // 250px (era 280) + gap 10 (era 14) — pedido do Felipe
                // (31/07/2026): caber 5 colunas (4 etapas + Finalizados) sem
                // rolagem horizontal, "faltou muito pouco" no tamanho antigo.
                flex: "0 0 250px",
                background: emFoco ? "#eef4ff" : "#f5f5f7",
                border: emFoco ? "1px dashed #0071e3" : "1px solid transparent",
                borderRadius: 14,
                padding: 10,
                boxSizing: "border-box",
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
                      <Link href={`${linkBase}/${lead.id}`} style={{ textDecoration: "none", color: "#1d1d1f", flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{lead.titulo}</div>
                        <div style={{ fontSize: 12, color: "#6e6e73" }}>{lead.subtitulo}</div>
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
                          style={{ border: "none", background: "none", color: "#1a7f37", cursor: "pointer", padding: 2, display: "flex" }}
                        >
                          <IconeGanho />
                        </button>
                        <button
                          type="button"
                          title="Marcar como perdido"
                          onClick={() => marcarPerdido(lead)}
                          style={{ border: "none", background: "none", color: "#d70015", cursor: "pointer", padding: 2, display: "flex" }}
                        >
                          <IconePerdido />
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

        {/* Coluna fixa "Finalizados" — sempre por último, sem
            onDragOver/onDrop (drop nela fica bloqueado pelo comportamento
            padrão do HTML5 DnD; só os botões ✅/❌ dos cards abertos marcam
            ganho/perdido). Cor da barra neutra (#1d1d1f) em vez de vir de
            PALETA_ETAPAS — ela não é uma etapa cíclica, é fixa. */}
        <div
          style={{
            flex: "0 0 250px",
            background: "#f5f5f7",
            border: "1px solid transparent",
            borderRadius: 14,
            padding: 10,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <div style={{ padding: "0 4px", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: "#1d1d1f" }}>Finalizados</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 11.5, color: "#6e6e73", fontWeight: 600 }}>
                  {formatValorBRLCompacto(leadsFinalizados.reduce((soma, l) => soma + l.valor, 0))}
                </span>
                <span style={{ fontSize: 12, color: "#6e6e73", fontWeight: 600 }}>{leadsFinalizados.length}</span>
              </span>
            </div>
            <div style={{ height: 3, borderRadius: 999, background: "#1d1d1f", marginTop: 8 }} />
            <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
              {(["TODOS", "GANHO", "PERDIDO"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFiltroFinalizados(f)}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 999,
                    border: filtroFinalizados === f ? "1px solid #1d1d1f" : "1px solid #d2d2d7",
                    background: filtroFinalizados === f ? "#1d1d1f" : "#fff",
                    color: filtroFinalizados === f ? "#fff" : "#1d1d1f",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {f === "TODOS" ? "Todos" : f === "GANHO" ? "Ganhos" : "Perdidos"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", minHeight: 0, flex: 1 }}>
            {leadsFinalizados.length === 0 && (
              <p style={{ fontSize: 12, color: "#a1a1a6", padding: "0 4px" }}>Nenhum lead finalizado aqui.</p>
            )}
            {leadsFinalizados.map((lead) => (
              <div
                key={lead.id}
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  padding: 12,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                  <Link href={`/admin/crm/${lead.id}`} style={{ textDecoration: "none", color: "#1d1d1f", flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{lead.titulo}</div>
                    <div style={{ fontSize: 12, color: "#6e6e73" }}>{lead.subtitulo}</div>
                    {lead.valor > 0 && (
                      <div style={{ fontSize: 12, color: "#1a7f37", fontWeight: 700, marginTop: 2 }}>
                        {formatValorBRL(lead.valor)}
                      </div>
                    )}
                  </Link>
                  <button
                    type="button"
                    title="Reabrir (volta pro board)"
                    onClick={() => reabrir(lead)}
                    style={{
                      border: "1px solid #d2d2d7",
                      borderRadius: 7,
                      background: "#fff",
                      color: "#1d1d1f",
                      cursor: "pointer",
                      padding: "3px 7px",
                      fontSize: 11,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    ↩
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 9px",
                      borderRadius: 999,
                      color: lead.desfecho === "GANHO" ? "#1a7f37" : "#d70015",
                      background: lead.desfecho === "GANHO" ? "#1a7f371a" : "#d700151a",
                      flexShrink: 0,
                    }}
                  >
                    {lead.desfecho === "GANHO" ? <IconeGanho size={11} /> : <IconePerdido size={11} />}
                    {lead.desfecho === "GANHO" ? "Ganho" : "Perdido"}
                  </span>
                  {lead.stageId && (
                    <span style={{ fontSize: 11, color: "#a1a1a6" }}>{nomeEtapa.get(lead.stageId) ?? "—"}</span>
                  )}
                </div>
                {lead.desfecho === "PERDIDO" && lead.motivoPerda && (
                  <p style={{ margin: 0, fontSize: 11.5, color: "#a1a1a6" }}>“{lead.motivoPerda}”</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
