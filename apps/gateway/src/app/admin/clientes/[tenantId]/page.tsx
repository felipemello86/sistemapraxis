import { notFound, redirect } from "next/navigation";
import { getAdminSession, prisma } from "@praxis/core";
import { gerarLinkCheckoutAction, gerarLinkPortalAction, impersonarAction } from "../../actions";
import { STATUS_LABEL, STATUS_COLOR } from "../../statusLabels";
import { CheckoutForm } from "./CheckoutForm";
import { PortalForm } from "./PortalForm";

const EVENTO_LABEL: Record<string, string> = {
  CHECKOUT_CONCLUIDO: "Checkout concluído",
  FATURA_PAGA: "Fatura paga",
  FATURA_FALHOU: "Fatura falhou",
  ASSINATURA_ATUALIZADA: "Assinatura atualizada",
  ASSINATURA_CANCELADA: "Assinatura cancelada",
};

function formatarData(d: Date | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

export default async function ClienteDetalhePage({ params }: { params: { tenantId: string } }) {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    include: { subscription: { include: { plan: true } } },
  });
  if (!tenant) notFound();

  const [planos, eventos] = await Promise.all([
    prisma.subscriptionPlan.findMany({ where: { ativo: true }, orderBy: { valorCentavos: "asc" } }),
    prisma.paymentEvent.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);

  const status = tenant.subscription?.status ?? "SEM_ASSINATURA";
  const boundImpersonar = impersonarAction.bind(null, tenant.id);

  return (
    <main style={{ minHeight: "100svh", padding: "max(24px, env(safe-area-inset-top)) 24px 60px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <a href="/admin/clientes" style={{ color: "#0071e3", fontSize: 14, textDecoration: "none" }}>
          ← Clientes
        </a>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "12px 0 20px" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{tenant.name}</h1>
            <p style={{ color: "#6e6e73", fontSize: 13, margin: "4px 0 0" }}>
              /{tenant.slug} · cliente desde {formatarData(tenant.createdAt)}
            </p>
          </div>
          <form action={boundImpersonar}>
            <button
              type="submit"
              style={{
                padding: "9px 16px",
                borderRadius: 10,
                border: "none",
                background: "#0071e3",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Acessar sistema
            </button>
          </form>
        </div>

        <section style={{ background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 1px 2px rgba(0,0,0,0.06)", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Assinatura</h2>
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

          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14, fontSize: 13, color: "#1d1d1f" }}>
            <span>Plano atual: <strong>{tenant.subscription?.plan?.nome ?? "nenhum"}</strong></span>
            <span>Próxima cobrança: {formatarData(tenant.subscription?.currentPeriodEnd)}</span>
            {tenant.subscription?.cancelAtPeriodEnd && (
              <span style={{ color: "#d70015" }}>Cancelamento agendado pro fim do período atual.</span>
            )}
          </div>

          <CheckoutForm tenantId={tenant.id} planos={planos} action={gerarLinkCheckoutAction} />

          {tenant.subscription?.stripeCustomerId && (
            <div style={{ marginTop: 12 }}>
              <PortalForm tenantId={tenant.id} action={gerarLinkPortalAction} />
            </div>
          )}
        </section>

        <section style={{ background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>Histórico de pagamentos</h2>
          {eventos.length === 0 ? (
            <p style={{ color: "#6e6e73", fontSize: 13, margin: 0 }}>Nenhum evento de pagamento ainda.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {eventos.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    borderBottom: "1px solid #f0f0f2",
                    paddingBottom: 8,
                  }}
                >
                  <span>{EVENTO_LABEL[ev.tipo] ?? ev.tipo}</span>
                  <span style={{ color: "#6e6e73" }}>
                    {ev.valorCentavos ? `R$ ${(ev.valorCentavos / 100).toFixed(2)} · ` : ""}
                    {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(ev.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
