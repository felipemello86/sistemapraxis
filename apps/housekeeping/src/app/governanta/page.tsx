import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";
import GovernantaView from "./GovernantaView";

// Controle de inspeções: lista de UHs aguardando/inspecionadas + realizar a
// inspeção em si + aprovar/rejeitar solicitação de troca. Portado de
// apps/housekeeping/src/app/governanta/page.tsx + g/[token]/GovernantaView.tsx
// (v1), mesclados numa tela só por sessão (ver comentário em GovernantaView.tsx).
export default async function GovernantaPage() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }
  // Visualização liberada mesmo sem acesso ao módulo — só operar fica
  // restrito (ver comentário em apps/maintenance/src/app/page.tsx).
  const podeOperar = await hasModuleAccess(session, "HOUSEKEEPING");

  return <GovernantaView role={session.role} podeOperar={podeOperar} />;
}
