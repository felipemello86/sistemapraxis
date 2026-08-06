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
  criarParceiroAction,
  excluirParceiroAction,
  atualizarParceiroDadosAction,
} from "../actions";
import { NovoLeadForm } from "./NovoLeadForm";
import { KanbanBoard } from "./KanbanBoard";
import { ParceirosSection } from "./ParceirosSection";

export default async function CrmBoard() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  await garantirCrmPronto();

  const [etapas, leads, parceiros] = await Promise.all([
    prisma.pipelineStage.findMany({ orderBy: { ordem: "asc" } }),
    prisma.demoLead.findMany({
      orderBy: { createdAt: "desc" },
      include: { stage: true },
    }),
    prisma.crmParceiro.findMany({ orderBy: { nome: "asc" } }),
  ]);

  return (
    // 30/07/2026, 2ª rodada: a versão anterior (altura fixa 100svh + flex:1
    // até o board) resolvia o scroll da página, mas fazia a linha de
    // colunas SEMPRE esticar até preencher o espaço inteiro disponível —
    // mesmo com poucos cards, sobrava um vão vazio enorme antes do
    // "Finalizados" (que é só um sibling logo depois da linha). Trocado por
    // fluxo normal (minHeight, sem flex:1 obrigando a esticar): a linha de
    // colunas agora só cresce até a altura do próprio conteúdo, com um teto
    // (ver maxHeight no KanbanBoard) só pra colunas realmente longas — aí
    // sim rolam por dentro em vez de empurrar a página. "Finalizados" some
    // coladinho embaixo do board de verdade, não lá embaixo na tela.
    <main
      style={{
        minHeight: "100svh",
        // 16px nas laterais (era 24) — pedido do Felipe (31/07/2026): ajuda
        // a caber as 5 colunas do board sem rolagem horizontal, junto com a
        // redução de largura/gap das colunas em KanbanBoard.tsx.
        padding: "max(24px, env(safe-area-inset-top)) 16px 24px",
      }}
    >
      <div style={{ maxWidth: "100%", margin: "0 auto", width: "100%" }}>
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
            <NovoLeadForm action={criarLeadManualAction} parceiros={parceiros} />
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
          // titulo/subtitulo (06/08/2026) — KanbanBoard virou genérico pra
          // também ser usado pelo módulo Vendas do tenant (ver
          // KanbanBoard.tsx); aqui hotel é o título (linha em negrito) e
          // nome do contato é o subtítulo, igual sempre foi visualmente.
          leadsIniciais={leads.map((l) => ({ ...l, titulo: l.hotel, subtitulo: l.nome }))}
          moverEtapaAction={moverEtapaAction}
          excluirLeadAction={excluirLeadAction}
          marcarGanhoAction={marcarGanhoAction}
          marcarPerdidoRapidoAction={marcarPerdidoRapidoAction}
          reabrirLeadAction={reabrirLeadAction}
        />

        <ParceirosSection
          parceiros={parceiros}
          criarAction={criarParceiroAction}
          excluirAction={excluirParceiroAction}
          atualizarAction={atualizarParceiroDadosAction}
        />
      </div>
    </main>
  );
}
