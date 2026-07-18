import { notFound } from "next/navigation";
import { prisma, getSession } from "@praxis/core";
import { podeGerenciarCadastros } from "@/lib/auth-guard";
import { UHsClient } from "./UHsClient";

export default async function UHsPage({
  params,
}: {
  params: { cliente: string };
}) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: params.cliente } });
  if (!tenant) notFound();

  const session = await getSession();

  if (!session || session.tenantId !== tenant.id) {
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

  const somenteLeitura = !podeGerenciarCadastros(session.role);

  return (
    <main style={{ minHeight: "100svh", padding: "max(20px, env(safe-area-inset-top)) 20px 40px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <a
          href={`/${tenant.slug}/configuracoes`}
          style={{ color: "#0071e3", fontSize: 14, textDecoration: "none" }}
        >
          ← Configurações
        </a>

        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "12px 0 4px" }}>Unidades (UHs)</h1>
        <p style={{ color: "#6e6e73", fontSize: 14, margin: "0 0 24px" }}>
          Cadastro único: as mesmas UHs valem para Governança, Manutenção e Avaliações.
        </p>

        <UHsClient somenteLeitura={somenteLeitura} />
      </div>
    </main>
  );
}
