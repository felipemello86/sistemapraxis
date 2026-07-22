import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";
import CamareiraView from "@/components/camareira/CamareiraView";

// "Minhas UHs" — backlog do dia da própria camareira logada. Sessão vem do
// cookie único da suíte (praxis_v2_session); login em si só existe no
// gateway, então sem sessão a gente manda a pessoa de volta pra lá.
export default async function MinhasUHsPage() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }

  // Visualização liberada mesmo sem acesso ao módulo — só operar fica
  // restrito (ver comentário em apps/maintenance/src/app/page.tsx).
  const podeOperar = await hasModuleAccess(session, "HOUSEKEEPING");

  return <CamareiraView podeOperar={podeOperar} />;
}
