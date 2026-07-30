import { redirect } from "next/navigation";
import { getAdminSession, prisma } from "@praxis/core";
import { garantirCrmPronto } from "./data";
import {
  moverEtapaAction,
  criarLeadManualAction,
  excluirLeadAction,
  marcarGanhoAction,
  marcarPerdidoRapidoAction,
  reabrirLeadAction,
} from "../actions";
import { NovoLeadForm } from "./NovoLeadForm";
import { KanbanBoard } from "./KanbanBoard";

export default async function CrmBoard() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  await garantirCrmPronto();

  const [etapas, leads] = await Promise.all([
    prisma.pipelineStage.findMany({ orderBy: { ordem: "asc" } }),
    prisma.demoLead.findMany({
      orderBy: { createdAt: "desc" },
      include: { stage: true },
    }),
  ]);

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

        <KanbanBoard
          etapas={etapas}
          leadsIniciais={leads}
          moverEtapaAction={moverEtapaAction}
          excluirLeadAction={excluirLeadAction}
          marcarGanhoAction={marcarGanhoAction}
          marcarPerdidoRapidoAction={marcarPerdidoRapidoAction}
          reabrirLeadAction={reabrirLeadAction}
        />
      </div>
    </main>
  );
}
