import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";
import BurndownChart from "./BurndownChart";

// Tela "Tempo Real" — burndown do dia. Portado de
// apps/housekeeping/src/app/dashboard/page.tsx (v1). É a tela padrão do
// módulo pra quem não é CAMAREIRA (ver src/app/page.tsx, que redireciona
// pra cá).
export default async function DashboardPage() {
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

  return <BurndownChart role={session.role} />;
}
