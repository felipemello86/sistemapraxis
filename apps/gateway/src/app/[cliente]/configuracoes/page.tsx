import { notFound } from "next/navigation";
import { prisma, getSession } from "@praxis/core";
import { ChangePasswordForm } from "./ChangePasswordForm";

const ROLE_LABEL: Record<string, string> = {
  MASTER: "Master",
  GERENTE: "Gerente",
  GOVERNANTA: "Governanta",
  CAMAREIRA: "Camareira",
  LAVANDERIA: "Lavanderia",
  MANUTENCAO: "Manutenção",
  ATENDIMENTO: "Atendimento",
};

export default async function ConfiguracoesHub({
  params,
}: {
  params: { cliente: string };
}) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: params.cliente } });
  if (!tenant) notFound();

  const session = await getSession();

  if (!session) {
    return (
      <main
        style={{
          minHeight: "100svh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          textAlign: "center",
          padding: 24,
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Entre primeiro</h1>
        <a href={`/${tenant.slug}`} style={{ color: "#0071e3", fontWeight: 600, marginTop: 8 }}>
          ← Voltar
        </a>
      </main>
    );
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });

  return (
    <main style={{ minHeight: "100svh", padding: "20px 20px 40px" }}>
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <a href={`/${tenant.slug}`} style={{ color: "#0071e3", fontSize: 14, textDecoration: "none" }}>
          ← Início
        </a>

        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "12px 0 24px" }}>Configurações</h1>

        <section
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: 20,
            marginBottom: 20,
            boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          }}
        >
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{session.nome}</p>
          <p style={{ margin: "4px 0 0", color: "#6e6e73", fontSize: 14 }}>{session.email}</p>
          <p style={{ margin: "2px 0 0", color: "#6e6e73", fontSize: 14 }}>
            {ROLE_LABEL[session.role] ?? session.role}
          </p>
        </section>

        <a
          href={`/${tenant.slug}/configuracoes/usuarios`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#fff",
            borderRadius: 16,
            padding: 20,
            marginBottom: 12,
            boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
            textDecoration: "none",
            color: "#1d1d1f",
          }}
        >
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Usuários</h2>
            <p style={{ margin: 0, color: "#6e6e73", fontSize: 13 }}>Cadastro único, válido em qualquer módulo</p>
          </div>
          <span style={{ color: "#0071e3", fontSize: 20 }}>›</span>
        </a>

        <a
          href={`/${tenant.slug}/configuracoes/uhs`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#fff",
            borderRadius: 16,
            padding: 20,
            marginBottom: 20,
            boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
            textDecoration: "none",
            color: "#1d1d1f",
          }}
        >
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Unidades (UHs)</h2>
            <p style={{ margin: 0, color: "#6e6e73", fontSize: 13 }}>Cadastro único, válido em qualquer módulo</p>
          </div>
          <span style={{ color: "#0071e3", fontSize: 20 }}>›</span>
        </a>

        <section
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: 20,
            boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>Trocar senha</h2>
          <ChangePasswordForm temSenha={!!user?.passwordHash} />
        </section>
      </div>
    </main>
  );
}
