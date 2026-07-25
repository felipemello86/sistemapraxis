import { redirect } from "next/navigation";
import { getAdminSession } from "@praxis/core";
import { criarClienteAction } from "../actions";
import { NovoClienteForm } from "./NovoClienteForm";

export default async function NovoClientePage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  return (
    <main style={{ minHeight: "100svh", padding: "max(24px, env(safe-area-inset-top)) 24px 60px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <a href="/admin" style={{ color: "#0071e3", fontSize: 14, textDecoration: "none" }}>
          ← Painel
        </a>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "12px 0 4px" }}>Novo cliente</h1>
        <p style={{ color: "#6e6e73", fontSize: 13, margin: "0 0 20px" }}>
          Cria o tenant, os módulos habilitados e o usuário MASTER inicial.
        </p>

        <NovoClienteForm action={criarClienteAction} />
      </div>
    </main>
  );
}
