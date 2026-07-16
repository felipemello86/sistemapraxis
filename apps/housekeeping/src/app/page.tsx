import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";

// Rota raiz do módulo (vira "/governance" com o basePath) — é pra onde o
// tile "Governança" do hub do gateway leva. Segue o mesmo padrão da v1
// (ver apps/housekeeping/src/app/page.tsx lá): despacha por cargo.
//
// Só a fatia da camareira ("Minhas UHs") foi portada até agora — as telas
// de gestão da governanta (criar/aprovar atribuições, inspeção) ainda não
// existem nesta reconstrução. Então, por enquanto, todo mundo que não é
// CAMAREIRA cai numa tela avisando isso, em vez de um 404 confuso.
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
      <p style={{ color: "#6e6e73", maxWidth: 360 }}>
        As telas de gestão (atribuições, inspeção) ainda estão em construção
        nesta versão. Por enquanto só a visão da camareira ("Minhas UHs")
        está disponível.
      </p>
      <a href={process.env.NEXT_PUBLIC_GATEWAY_URL || "/"} className="btn-secondary">
        Voltar ao hub
      </a>
    </main>
  );
}
