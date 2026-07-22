import { redirect } from "next/navigation";
import { getSession } from "@praxis/core";

// Rota raiz do módulo (vira "/governance" com o basePath) — é pra onde o
// tile "Governança" do hub do gateway leva. Igual v1 (ver
// apps/housekeeping/src/app/page.tsx lá): só despacha por cargo, sem UI
// própria. CAMAREIRA vai pro seu backlog de UHs; o resto vai pro dashboard
// "Tempo Real" (burndown do dia), que é a tela principal de gestão.
export default async function GovernancaHome() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }

  // Visualização liberada mesmo sem acesso ao módulo — ver comentário em
  // apps/maintenance/src/app/page.tsx (mesmo padrão). O dispatcher em si só
  // decide pra onde mandar por cargo, não bloqueia mais por hasModuleAccess.
  redirect(session.role === "CAMAREIRA" ? "/camareira" : "/dashboard");
}
