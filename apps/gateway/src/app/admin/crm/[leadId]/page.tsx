import { redirect } from "next/navigation";
import { getAdminSession } from "@praxis/core";
import { LeadDetalheConteudo } from "./LeadDetalheConteudo";

// Página cheia — usada quando o lead é acessado direto por URL ou refresh
// (favorito, link compartilhado etc). Ao clicar num card dentro do board
// (/admin/crm), o mesmo conteúdo abre como popup em vez disso — ver
// crm/@modal/(.)[leadId]/page.tsx e crm/layout.tsx.
export default async function LeadDetalhe({ params }: { params: { leadId: string } }) {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  return (
    <main style={{ minHeight: "100svh", padding: "max(24px, env(safe-area-inset-top)) 24px 60px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <a href="/admin/crm" style={{ color: "#6e6e73", fontSize: 13, textDecoration: "none" }}>
          ← Funil
        </a>
        <div style={{ marginTop: 12 }}>
          <LeadDetalheConteudo leadId={params.leadId} />
        </div>
      </div>
    </main>
  );
}
