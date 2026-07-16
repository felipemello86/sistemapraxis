import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";
import ConfiguracoesClient from "./ConfiguracoesClient";

// Portado de apps/housekeeping/src/app/configuracoes/page.tsx (v1).
export default async function ConfiguracoesPage() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }
  const podeAcessar = await hasModuleAccess(session, "HOUSEKEEPING");
  if (!podeAcessar) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }

  return <ConfiguracoesClient role={session.role} />;
}
