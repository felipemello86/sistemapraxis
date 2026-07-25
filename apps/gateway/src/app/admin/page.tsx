import { redirect } from "next/navigation";
import { getAdminSession, prisma, MODULE_LABELS } from "@praxis/core";
import { logoutAdminAction, criarPlanoAction, impersonarAction, atualizarPlanoAction, excluirPlanoAction } from "./actions";
import { NovoPlanoForm } from "./NovoPlanoForm";
import { EditarPlanoForm } from "./EditarPlanoForm";

const STATUS_LABEL: Record<string, string> = {
  SEM_ASSINATURA: "Sem assinatura",
  INCOMPLETA: "Checkout pendente",
  ATIVA: "Ativa",
  INADIMPLENTE: "Inadimplente",
  CANCELADA: "Cancelada",
};
const STATUS_COLOR: Record<string, string> = {
  SEM_ASSINATURA: "#6e6e73",
  INCOMPLETA: "#ff9500",
  ATIVA: "#34c759",
  INADIMPLENTE: "#d70015",
  CANCELADA: "#8e8e93",
};

export default async function AdminDashboard() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  const [tenants, planos] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        modules: { where: { enabled: true } },
        subscription: { include: { plan: true } },
      },
    }),
    prisma.subscriptionPlan.findMany({ where: { ativo: true }, orderBy: { valorCentavos: "asc" } }),
  ]);

  return (
    <main style={{ minHeight: "100svh", padding: "max(24px, env(safe-area-inset-top)) 24px 60px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
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

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Clientes ({tenants.length})</h2>
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

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
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

        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>Planos ({planos.length})</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {planos.length === 0 && (
            <p style={{ color: "#6e6e73", fontSize: 14 }}>
              Nenhum plano cadastrado. Crie o Price correspondente no dashboard do Stripe primeiro, depois cadastre
              aqui com o Price ID.
            </p>
          )}
          {planos.map((p) => (
            <EditarPlanoForm
              key={p.id}
              plano={p}
              atualizarAction={atualizarPlanoAction}
              excluirAction={excluirPlanoAction}
            />
          ))}
        </div>

        <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 10px" }}>Cadastrar novo plano</h3>
          <NovoPlanoForm action={criarPlanoAction} />
        </div>
      </div>
    </main>
  );
}
