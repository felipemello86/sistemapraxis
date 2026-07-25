import { getAdminSession } from "@praxis/core";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "./AdminLoginForm";

export default async function AdminLoginPage() {
  const session = await getAdminSession();
  if (session) redirect("/admin");

  return (
    <main
      style={{
        minHeight: "100svh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/praxis-logo.png" alt="Praxis" style={{ height: 40, marginBottom: 12 }} />
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Painel administrativo</h1>
        <p style={{ color: "#6e6e73", fontSize: 13, margin: "4px 0 0" }}>Acesso restrito à equipe Praxis</p>
      </div>
      <AdminLoginForm />
    </main>
  );
}
