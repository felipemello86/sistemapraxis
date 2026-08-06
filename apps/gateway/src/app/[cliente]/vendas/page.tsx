import { notFound } from "next/navigation";
import { prisma, getSession, hasModuleAccess } from "@praxis/core";
import { garantirEtapasVendasPadrao } from "./data";
import {
  moverEtapaAction,
  criarLeadManualAction,
  excluirLeadAction,
  marcarGanhoAction,
  marcarPerdidoRapidoAction,
  reabrirLeadAction,
} from "./actions";
import { NovoLeadForm } from "./NovoLeadForm";
import { KanbanBoard } from "../../admin/crm/KanbanBoard";

// Módulo Vendas do tenant (06/08/2026) — CRM do próprio hotel com os
// clientes/hóspedes dele, reaproveitando a mesma engine visual do CRM do
// admin (KanbanBoard.tsx), mas com dados 100% isolados por tenant (ver
// VendasEtapa/VendasLead/VendasAtividade em schema.prisma). Mesmo guard de
// sessão/módulo de todo módulo da suíte (ver [cliente]/inteligencia).
export default async function VendasBoard({ params }: { params: { cliente: string } }) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: params.cliente } });
  if (!tenant) notFound();

  const session = await getSession();
  if (!session || session.tenantId !== tenant.id) {
    return (
      <main style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Entre primeiro</h1>
          <a href={`/${tenant.slug}`} style={{ color: "#0071e3", fontSize: 14, textDecoration: "none", display: "inline-block", marginTop: 8 }}>
            ← Voltar
          </a>
        </div>
      </main>
    );
  }

  const podeAcessar = await hasModuleAccess(session, "SALES");
  if (!podeAcessar) {
    return (
      <main style={{ minHeight: "100svh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Vendas</h1>
          <p style={{ color: "#6e6e73", fontSize: 14, marginTop: 8 }}>Você não tem acesso a este módulo ainda.</p>
          <a href={`/${tenant.slug}`} style={{ color: "#0071e3", fontSize: 14, textDecoration: "none", display: "inline-block", marginTop: 8 }}>
            ← Voltar
          </a>
        </div>
      </main>
    );
  }

  await garantirEtapasVendasPadrao(tenant.id);

  const [etapas, leadsBrutos] = await Promise.all([
    prisma.vendasEtapa.findMany({ where: { tenantId: tenant.id }, orderBy: { ordem: "asc" } }),
    prisma.vendasLead.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "desc" } }),
  ]);

  // titulo/subtitulo (ver KanbanBoard.tsx): nome do contato em destaque,
  // empresa (se houver) como linha secundária — inverso do admin (lá o
  // hotel é o título), porque aqui empresa é opcional.
  const leads = leadsBrutos.map((l) => ({ ...l, titulo: l.nome, subtitulo: l.empresa || "—" }));

  const boundMoverEtapa = moverEtapaAction.bind(null, tenant.slug);
  const boundCriarLead = criarLeadManualAction.bind(null, tenant.slug);
  const boundExcluirLead = excluirLeadAction.bind(null, tenant.slug);
  const boundMarcarGanho = marcarGanhoAction.bind(null, tenant.slug);
  const boundMarcarPerdido = marcarPerdidoRapidoAction.bind(null, tenant.slug);
  const boundReabrir = reabrirLeadAction.bind(null, tenant.slug);

  return (
    <main style={{ minHeight: "100svh", padding: "max(24px, env(safe-area-inset-top)) 24px 24px" }}>
      <div style={{ maxWidth: "100%", margin: "0 auto", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
            <a href={`/${tenant.slug}`} style={{ color: "#6e6e73", fontSize: 13, textDecoration: "none", flexShrink: 0 }}>
              ← Início
            </a>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, whiteSpace: "nowrap" }}>
              Vendas ({leads.length})
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
            <NovoLeadForm action={boundCriarLead} />
            <a
              href={`/${tenant.slug}/vendas/canais`}
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
              Canais
            </a>
          </div>
        </div>

        <KanbanBoard
          etapas={etapas}
          leadsIniciais={leads}
          linkBase={`/${tenant.slug}/vendas`}
          moverEtapaAction={boundMoverEtapa}
          excluirLeadAction={boundExcluirLead}
          marcarGanhoAction={boundMarcarGanho}
          marcarPerdidoRapidoAction={boundMarcarPerdido}
          reabrirLeadAction={boundReabrir}
        />
      </div>
    </main>
  );
}
