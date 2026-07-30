import { redirect } from "next/navigation";
import { getAdminSession, prisma } from "@praxis/core";
import { logoutAdminAction } from "./actions";

// Painel principal reorganizado em 3 tiles (30/07/2026, pedido do Felipe:
// "crie 3 tiles: Vendas, Clientes e Planos" — funcionando como botões pra
// cada módulo, não mais listas inteiras empilhadas nesta tela). As listas
// completas moraram pra /admin/clientes e /admin/planos; Vendas já apontava
// pro board do CRM (/admin/crm), que continua sendo a tela cheia dele.
// Só contagens aqui — nada de include pesado, já que não renderiza mais os
// detalhes de cada cliente/plano nesta tela.
export default async function AdminDashboard() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  const [totalTenants, totalPlanos, totalLeads, stageNovo] = await Promise.all([
    prisma.tenant.count(),
    prisma.subscriptionPlan.count({ where: { ativo: true } }),
    prisma.demoLead.count(),
    prisma.pipelineStage.findFirst({ orderBy: { ordem: "asc" } }),
  ]);
  const leadsNaPrimeiraEtapa = stageNovo
    ? await prisma.demoLead.count({ where: { stageId: stageNovo.id } })
    : 0;

  return (
    <main style={{ minHeight: "100svh", padding: "max(24px, env(safe-area-inset-top)) 24px 60px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Painel Praxis</h1>
            <p style={{ color: "#6e6e73", fontSize: 13, margin: "4px 0 0" }}>{admin.nome} · {admin.email}</p>
          </div>
          <form action={logoutAdminAction}>
            <button
              type="submit"
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                border: "1px solid #d2d2d7",
                background: "#fff",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Sair
            </button>
          </form>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <Tile
            href="/admin/crm"
            titulo="Vendas"
            numero={totalLeads}
            legenda="leads no funil"
            badge={leadsNaPrimeiraEtapa > 0 ? `${leadsNaPrimeiraEtapa} novo(s)` : undefined}
            corBarra="#F2C94C"
          />
          <Tile
            href="/admin/clientes"
            titulo="Clientes"
            numero={totalTenants}
            legenda="hotéis na suíte"
            corBarra="#2F80ED"
          />
          <Tile
            href="/admin/planos"
            titulo="Planos"
            numero={totalPlanos}
            legenda="planos ativos"
            corBarra="#9B51E0"
          />
        </div>
      </div>
    </main>
  );
}

function Tile({
  href,
  titulo,
  numero,
  legenda,
  badge,
  corBarra,
}: {
  href: string;
  titulo: string;
  numero: number;
  legenda: string;
  badge?: string;
  corBarra: string;
}) {
  return (
    <a
      href={href}
      style={{
        display: "block",
        background: "#fff",
        borderRadius: 16,
        padding: 20,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        textDecoration: "none",
        color: "#1d1d1f",
      }}
    >
      <div style={{ height: 3, borderRadius: 999, background: corBarra, marginBottom: 14 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#6e6e73" }}>{titulo}</span>
        {badge && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#ff9500",
              background: "#ff95001a",
              padding: "2px 8px",
              borderRadius: 999,
            }}
          >
            {badge}
          </span>
        )}
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 32, fontWeight: 700 }}>{numero}</p>
      <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6e6e73" }}>{legenda}</p>
      <p style={{ margin: "14px 0 0", fontSize: 13, color: "#0071e3", fontWeight: 600 }}>Abrir →</p>
    </a>
  );
}
