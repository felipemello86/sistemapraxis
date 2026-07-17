import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";
import RelatoriosView from "./RelatoriosView";

// Portado de apps/housekeeping/src/app/relatorios/page.tsx (v1).
export default async function RelatoriosPage() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }
  const podeAcessar = await hasModuleAccess(session, "HOUSEKEEPING");
  if (!podeAcessar) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }

  return <RelatoriosView />;
}
