import { redirect } from "next/navigation";
import { getAdminSession, prisma, MODULE_LABELS } from "@praxis/core";
import { impersonarAction } from "../actions";
import { STATUS_LABEL, STATUS_COLOR } from "../statusLabels";

// Lista completa de clientes — antes vivia direto em /admin, movida pra cá
// na reorganização em tiles (30/07/2026, pedido do Felipe: "3 tiles Vendas/
// Clientes/Planos" no painel principal, cada um levando pra sua própria
// tela). Conteúdo idêntico ao que já existia, só em rota própria.
export default async function ClientesPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      modules: { where: { enabled: true } },
      subscription: { include: { plan: true } },
    },
  });

  return (
    <main style={{ minHeight: "100svh", padding: "max(24px, env(safe-area-inset-top)) 24px 60px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <a href="/admin" style={{ color: "#6e6e73", fontSize: 13, textDecoration: "none" }}>
          ← Painel
        </a>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "10px 0 20px" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Clientes ({tenants.length})</h1>
          <a
            href="/admin/novo"
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              background: "#1d1d1f",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            + Novo cliente
          </a>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {tenants.length === 0 && (
            <p style={{ color: "#6e6e73", fontSize: 14 }}>Nenhum cliente cadastrado ainda.</p>
          )}
          {tenants.map((t) => {
            const status = t.subscription?.status ?? "SEM_ASSINATURA";
            const boundImpersonar = impersonarAction.bind(null, t.id);
            return (
              <div
                key={t.id}
                style={{
                  background: "#fff",
                  borderRadius: 14,
                  padding: 16,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: STATUS_COLOR[status],
                        background: `${STATUS_COLOR[status]}1a`,
                        padding: "2px 8px",
                        borderRadius: 999,
                      }}
                    >
                      {STATUS_LABEL[status]}
                    </span>
                  </div>
                  <p style={{ margin: "4px 0 0", color: "#6e6e73", fontSize: 13 }}>
                    /{t.slug} · {t.modules.map((m) => MODULE_LABELS[m.module]).join(", ") || "nenhum módulo habilitado"}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <a
                    href={`/admin/clientes/${t.id}`}
                    style={{
                      padding: "7px 12px",
                      borderRadius: 9,
                      border: "1px solid #d2d2d7",
                      color: "#1d1d1f",
                      fontSize: 13,
                      textDecoration: "none",
                    }}
                  >
                    Pagamentos
                  </a>
                  <form action={boundImpersonar}>
                    <button
                      type="submit"
                      style={{
                        padding: "7px 12px",
                        borderRadius: 9,
                        border: "none",
                        background: "#0071e3",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Acessar
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
