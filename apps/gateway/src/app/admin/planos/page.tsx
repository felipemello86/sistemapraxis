import { redirect } from "next/navigation";
import { getAdminSession, prisma } from "@praxis/core";
import { criarPlanoAction, atualizarPlanoAction, excluirPlanoAction } from "../actions";
import { NovoPlanoForm } from "../NovoPlanoForm";
import { EditarPlanoForm } from "../EditarPlanoForm";

// Lista completa de planos (cadastro/edição/exclusão) — antes vivia direto
// em /admin, movida pra cá na reorganização em tiles (30/07/2026, ver
// ../clientes/page.tsx pro mesmo raciocínio). Conteúdo idêntico ao que já
// existia, só em rota própria.
export default async function PlanosPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  const planos = await prisma.subscriptionPlan.findMany({
    where: { ativo: true },
    orderBy: { valorCentavos: "asc" },
  });

  return (
    <main style={{ minHeight: "100svh", padding: "max(24px, env(safe-area-inset-top)) 24px 60px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <a href="/admin" style={{ color: "#6e6e73", fontSize: 13, textDecoration: "none" }}>
          ← Painel
        </a>

        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "10px 0 20px" }}>Planos ({planos.length})</h1>

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
