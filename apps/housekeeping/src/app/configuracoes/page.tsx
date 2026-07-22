import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";
import ConfiguracoesClient from "./ConfiguracoesClient";

// Portado de apps/housekeeping/src/app/configuracoes/page.tsx (v1).
export default async function ConfiguracoesPage() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }
  // Visualização liberada mesmo sem acesso ao módulo — só operar fica
  // restrito (ver comentário em apps/maintenance/src/app/page.tsx).
  const podeOperar = await hasModuleAccess(session, "HOUSEKEEPING");

  return <ConfiguracoesClient role={session.role} podeOperar={podeOperar} />;
}
