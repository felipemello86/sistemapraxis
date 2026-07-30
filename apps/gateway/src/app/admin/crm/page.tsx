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
    // 30/07/2026: layout virou flex-column de altura fixa (100svh) em vez de
    // minHeight + fluxo normal — era o que fazia o "Finalizados" precisar de
    // scroll da página inteira pra aparecer quando uma coluna tinha muitos
    // cards (o cálculo antigo, "calc(100svh - 220px)" num número fixo
    // chutado, não batia com a altura real do cabeçalho). Com flex-column +
    // flex:1 no board, cada pedaço ocupa exatamente o espaço que sobra, sem
    // número mágico.
    <main
      style={{
        height: "100svh",
        boxSizing: "border-box",
        padding: "max(24px, env(safe-area-inset-top)) 24px 24px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ maxWidth: "100%", margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {/* 30/07/2026: header condensado numa linha só (pedido do Felipe —
            "prioridade dessa tela é o kanban", muito espaço perdido em
            breadcrumb/título/subtítulo/botão cada um na sua própria linha).
            "+ Novo lead" mora aqui dentro também: colapsado é só um botão
            (cabe na linha); quando expande vira o form completo e quebra
            linha sozinho (a linha já é flexWrap). */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
            <a href="/admin" style={{ color: "#6e6e73", fontSize: 13, textDecoration: "none", flexShrink: 0 }}>
              ← Painel
            </a>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, whiteSpace: "nowrap" }}>
              Funil de vendas ({leads.length})
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
            <NovoLeadForm action={criarLeadManualAction} />
            <a
              href="/admin/crm/campos"
              style={{
                padding: "7px 12px",
                borderRadius: 9,
                border: "1px solid #d2d2d7",
                background: "#fff",
                color: "#1d1d1f",
                fontSize: 12.5,
                fontWeight: 600,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              Gerenciar campos
            </a>
            <a
              href="/admin/crm/etapas"
              style={{
                padding: "7px 12px",
                borderRadius: 9,
                border: "1px solid #d2d2d7",
                background: "#fff",
                color: "#1d1d1f",
                fontSize: 12.5,
                fontWeight: 600,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              Gerenciar etapas
            </a>
          </div>
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
