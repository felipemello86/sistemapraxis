import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";

// Rota raiz do módulo (vira "/governance" com o basePath) — é pra onde o
// tile "Governança" do hub do gateway leva. Segue o mesmo padrão da v1
// (ver apps/housekeeping/src/app/page.tsx lá): despacha por cargo.
//
// O loop operacional diário (seleção/liberação, atribuição, inspeção) já
// existe nesta reconstrução — falta só um menu/sidebar de verdade (fatia
// própria, ver task). Enquanto isso não existe, a raiz mostra um hub simples
// linkando pras 3 telas de gestão pra quem não é CAMAREIRA.
const TELAS_GESTAO = [
  { href: "/selecao", label: "Seleção e Liberação", desc: "Selecionar UHs do dia e liberar conforme ficam prontas" },
  { href: "/atribuicao", label: "Atribuição", desc: "Distribuir UHs entre as camareiras" },
  { href: "/governanta", label: "Inspeções", desc: "Inspecionar UHs concluídas e aprovar solicitações" },
];

export default async function GovernancaHome() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }

  const podeAcessar = await hasModuleAccess(session, "HOUSEKEEPING");
  if (!podeAcessar) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }

  if (session.role === "CAMAREIRA") {
    redirect("/camareira");
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        textAlign: "center",
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>Governança</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 360 }}>
        {TELAS_GESTAO.map((t) => (
          <a
            key={t.href}
            href={t.href}
            className="card"
            style={{ textAlign: "left", textDecoration: "none", display: "block" }}
          >
            <p style={{ fontWeight: 600, color: "#1d1d1f" }}>{t.label}</p>
            <p style={{ fontSize: 13, color: "#6e6e73", marginTop: 2 }}>{t.desc}</p>
          </a>
        ))}
      </div>
      <a href={process.env.NEXT_PUBLIC_GATEWAY_URL || "/"} className="btn-secondary">
        Voltar ao hub
      </a>
    </main>
  );
}
