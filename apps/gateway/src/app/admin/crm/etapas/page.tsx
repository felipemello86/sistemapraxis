import { redirect } from "next/navigation";
import { getAdminSession, prisma } from "@praxis/core";
import { garantirCrmPronto } from "../data";
import { EtapaCard } from "./EtapaCard";
import { NovaEtapaForm } from "./NovaEtapaForm";
import { criarEtapaAction, renomearEtapaAction, moverOrdemEtapaAction, excluirEtapaAction } from "../../actions";

export default async function EtapasPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  await garantirCrmPronto();

  const etapas = await prisma.pipelineStage.findMany({
    orderBy: { ordem: "asc" },
    include: { _count: { select: { leads: true } } },
  });

  return (
    <main style={{ minHeight: "100svh", padding: "max(24px, env(safe-area-inset-top)) 24px 60px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <a href="/admin/crm" style={{ color: "#6e6e73", fontSize: 13, textDecoration: "none" }}>
          ← Funil
        </a>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "10px 0 4px" }}>Etapas do funil</h1>
        <p style={{ color: "#6e6e73", fontSize: 13, margin: "0 0 20px" }}>
          A ordem aqui define a ordem das colunas no board. Ganho e perdido não são etapas — qualquer lead pode
          ser marcado ✅ ou ❌ em qualquer coluna, sem precisar mudar de etapa.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
          {etapas.map((etapa, i) => (
            <EtapaCard
              key={etapa.id}
              etapa={etapa}
              qtdLeads={etapa._count.leads}
              isPrimeira={i === 0}
              isUltima={i === etapas.length - 1}
              renomearAction={renomearEtapaAction}
              moverOrdemAction={moverOrdemEtapaAction}
              excluirAction={excluirEtapaAction}
            />
          ))}
        </div>

        <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 10px" }}>Nova etapa</h3>
          <NovaEtapaForm action={criarEtapaAction} />
        </div>
      </div>
    </main>
  );
}
