import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";
import AtribuicaoView from "./AtribuicaoView";

// Atribuição diária de camareiras às UHs + aprovação de solicitação de troca.
// Portado de apps/housekeeping/src/app/atribuicao/page.tsx (v1).
export default async function AtribuicaoPage() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }
  // Visualização liberada mesmo sem acesso ao módulo — só operar fica
  // restrito (ver comentário em apps/maintenance/src/app/page.tsx).
  const podeOperar = await hasModuleAccess(session, "HOUSEKEEPING");

  return <AtribuicaoView role={session.role} userId={session.userId} podeOperar={podeOperar} />;
}
