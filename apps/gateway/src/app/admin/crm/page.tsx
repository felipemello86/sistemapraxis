import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminSession, prisma } from "@praxis/core";
import { garantirCrmPronto } from "./data";
import { moverEtapaAction, criarLeadManualAction } from "../actions";
import { EtapaSelect } from "./EtapaSelect";
import { NovoLeadForm } from "./NovoLeadForm";

// Barra colorida embaixo do título de cada coluna do board — cada etapa
// "do meio" pega uma cor diferente da paleta (mesma ideia visual do
// Kommo/referência do Felipe, 30/07/2026), ciclando se houver mais etapas
// que cores. Ganho/Perdido são sempre verde/cinza — são os dois desfechos
// do funil, não faz sentido eles competirem por cor com as etapas do meio.
const PALETA_ETAPAS = ["#F2C94C", "#BB6BD9", "#2F80ED", "#56CCF2", "#F2994A", "#EB5757", "#9B51E0"];

function corDaEtapa(etapa: { ehGanho: boolean; ehPerdido: boolean }, index: number): string {
  if (etapa.ehGanho) return "#27AE60";
  if (etapa.ehPerdido) return "#828282";
  return PALETA_ETAPAS[index % PALETA_ETAPAS.length];
}

export default async function CrmBoard() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  await garantirCrmPronto();

  const [etapas, leads] = await Promise.all([
    prisma.pipelineStage.findMany({ orderBy: { ordem: "asc" } }),
    prisma.demoLead.findMany({
      orderBy: { createdAt: "desc" },
      include: { stage: true, responsavel: true },
    }),
  ]);

  const leadsPorEtapa = new Map<string, typeof leads>();
  for (const etapa of etapas) leadsPorEtapa.set(etapa.id, []);
  for (const lead of leads) {
    if (lead.stageId && leadsPorEtapa.has(lead.stageId)) leadsPorEtapa.get(lead.stageId)!.push(lead);
  }

  return (
    <main style={{ minHeight: "100svh", padding: "max(24px, env(safe-area-inset-top)) 24px 60px" }}>
      <div style={{ maxWidth: "100%", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <a href="/admin" style={{ color: "#6e6e73", fontSize: 13, textDecoration: "none" }}>
                ← Painel
              </a>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: "6px 0 0" }}>Funil de vendas ({leads.length})</h1>
            <p style={{ color: "#6e6e73", fontSize: 13, margin: "4px 0 0" }}>
              Leads do formulário da landing page. Fase 1 do CRM — WhatsApp/Instagram vêm depois.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignSelf: "flex-start" }}>
            <a
              href="/admin/crm/campos"
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                border: "1px solid #d2d2d7",
                background: "#fff",
                color: "#1d1d1f",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Gerenciar campos
            </a>
            <a
              href="/admin/crm/etapas"
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                border: "1px solid #d2d2d7",
                background: "#fff",
                color: "#1d1d1f",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Gerenciar etapas
            </a>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <NovoLeadForm action={criarLeadManualAction} />
        </div>

        <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 12 }}>
          {etapas.map((etapa, index) => {
            const leadsDaEtapa = leadsPorEtapa.get(etapa.id) ?? [];
            const corBarra = corDaEtapa(etapa, index);
            return (
              <div
                key={etapa.id}
                style={{
                  flex: "0 0 280px",
                  background: "#f5f5f7",
                  borderRadius: 14,
                  padding: 12,
                  maxHeight: "calc(100svh - 220px)",
                  display: "flex",
                  flexDirection: "column",
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
                    <p style={{ fontSize: 12, color: "#a1a1a6", padding: "0 4px" }}>Nenhum lead aqui.</p>
                  )}
                  {leadsDaEtapa.map((lead) => (
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
                      <Link href={`/admin/crm/${lead.id}`} style={{ textDecoration: "none", color: "#1d1d1f" }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{lead.hotel}</div>
                        <div style={{ fontSize: 12, color: "#6e6e73" }}>{lead.nome}</div>
                      </Link>
                      {lead.responsavel && (
                        <span
                          style={{
                            alignSelf: "flex-start",
                            fontSize: 10.5,
                            fontWeight: 600,
                            color: "#0071e3",
                            background: "#0071e31a",
                            padding: "2px 7px",
                            borderRadius: 999,
                          }}
                        >
                          {lead.responsavel.nome}
                        </span>
                      )}
                      {etapa.ehPerdido && lead.motivoPerda && (
                        <p style={{ fontSize: 11.5, color: "#8e8e93", margin: 0, fontStyle: "italic" }}>
                          “{lead.motivoPerda}”
                        </p>
                      )}
                      <EtapaSelect
                        leadId={lead.id}
                        etapaAtualId={lead.stageId}
                        etapas={etapas}
                        action={moverEtapaAction}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
