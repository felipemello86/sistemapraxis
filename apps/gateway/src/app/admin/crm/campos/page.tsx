import { redirect } from "next/navigation";
import { getAdminSession, prisma } from "@praxis/core";
import { CampoCard } from "./CampoCard";
import { NovoCampoForm } from "./NovoCampoForm";
import { criarCampoAction, editarCampoAction, excluirCampoAction } from "../../actions";

export default async function CamposPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  const campos = await prisma.leadCampoPersonalizado.findMany({ orderBy: { ordem: "asc" } });

  return (
    <main style={{ minHeight: "100svh", padding: "max(24px, env(safe-area-inset-top)) 24px 60px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <a href="/admin/crm" style={{ color: "#6e6e73", fontSize: 13, textDecoration: "none" }}>
          ← Funil
        </a>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "10px 0 4px" }}>Campos personalizados</h1>
        <p style={{ color: "#6e6e73", fontSize: 13, margin: "0 0 20px" }}>
          Campos extras que aparecem na tela de cada lead, além de nome/hotel/e-mail/telefone. Úteis pra qualificar
          o lead (ex: nº de UHs, orçamento) e, mais pra frente, pra guardar dados de WhatsApp/Instagram sem
          precisar de mudança no sistema.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
          {campos.length === 0 && <p style={{ color: "#6e6e73", fontSize: 14 }}>Nenhum campo personalizado ainda.</p>}
          {campos.map((campo) => (
            <CampoCard key={campo.id} campo={campo} editarAction={editarCampoAction} excluirAction={excluirCampoAction} />
          ))}
        </div>

        <div style={{ background: "#fff", borderRadius: 14, padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 10px" }}>Novo campo</h3>
          <NovoCampoForm action={criarCampoAction} />
        </div>
      </div>
    </main>
  );
}
