import { notFound } from "next/navigation";
import { prisma, getSession, hasModuleAccess } from "@praxis/core";
import { ConectarWhatsAppButton } from "./ConectarWhatsAppButton";
import { conectarWhatsAppAction, desconectarWhatsAppAction } from "./actions";

// Tela de conexão de canais do módulo Vendas (06/08/2026) — hoje só
// WhatsApp (Embedded Signup v4). Cada tenant conecta o PRÓPRIO número,
// diferente do número único hardcoded do CRM do admin. Ver
// ChannelConnection em schema.prisma e ConectarWhatsAppButton.tsx pro
// fluxo completo (popup → code + waba_id/phone_number_id → troca de
// token no servidor).
export default async function CanaisPage({ params }: { params: { cliente: string } }) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: params.cliente } });
  if (!tenant) notFound();

  const session = await getSession();
  if (!session || session.tenantId !== tenant.id) notFound();

  const podeAcessar = await hasModuleAccess(session, "SALES");
  if (!podeAcessar) notFound();

  const conexao = await prisma.channelConnection.findUnique({
    where: { tenantId_provider: { tenantId: tenant.id, provider: "WHATSAPP" } },
  });

  const boundConectar = conectarWhatsAppAction.bind(null, tenant.slug);
  const boundDesconectar = desconectarWhatsAppAction.bind(null, tenant.slug);

  return (
    <main style={{ minHeight: "100svh", padding: "max(24px, env(safe-area-inset-top)) 24px 60px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <a href={`/${tenant.slug}/vendas`} style={{ color: "#6e6e73", fontSize: 13, textDecoration: "none" }}>
          ← Vendas
        </a>

        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "12px 0 4px" }}>Canais</h1>
        <p style={{ color: "#6e6e73", fontSize: 13, margin: "0 0 20px" }}>
          Conecte o WhatsApp do seu hotel pra receber e responder mensagens direto pelo Vendas.
        </p>

        <section style={{ background: "#fff", borderRadius: 14, padding: 18, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>WhatsApp</h2>
            {conexao?.status === "CONECTADO" && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#1a7f37",
                  background: "#1a7f371a",
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                Conectado
              </span>
            )}
          </div>

          {conexao?.status === "CONECTADO" ? (
            <>
              <p style={{ fontSize: 13, color: "#1d1d1f", margin: "0 0 4px" }}>
                Número: <strong>{conexao.displayPhoneNumber ?? "—"}</strong>
              </p>
              {conexao.verifiedName && (
                <p style={{ fontSize: 13, color: "#6e6e73", margin: "0 0 16px" }}>Nome verificado: {conexao.verifiedName}</p>
              )}
              <form action={boundDesconectar}>
                <button
                  type="submit"
                  style={{
                    padding: "8px 14px",
                    borderRadius: 9,
                    border: "1px solid #d2d2d7",
                    background: "#fff",
                    color: "#d70015",
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Desconectar
                </button>
              </form>
            </>
          ) : (
            <ConectarWhatsAppButton action={boundConectar} jaConectado={false} />
          )}
        </section>
      </div>
    </main>
  );
}
