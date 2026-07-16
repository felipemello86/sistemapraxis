import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";
import MovimentosContainer from "./MovimentosContainer";

// Tela "Performance" (abas Performance/Por Etapa/Lavanderia). Portado de
// apps/housekeeping/src/app/movimentos/page.tsx (v1).
export default async function MovimentosPage() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }
  const podeAcessar = await hasModuleAccess(session, "HOUSEKEEPING");
  if (!podeAcessar) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }

  return <MovimentosContainer isMaster={session.role === "MASTER"} />;
}
