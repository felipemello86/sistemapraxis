import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";
import BurndownChart from "./BurndownChart";

// Tela "Tempo Real" — burndown do dia. Portado de
// apps/housekeeping/src/app/dashboard/page.tsx (v1). É a tela padrão do
// módulo pra quem não é CAMAREIRA (ver src/app/page.tsx, que redireciona
// pra cá como landing page default), mas isso é só o destino padrão — a
// tela em si fica visível pra qualquer cargo, incluindo CAMAREIRA, que pode
// chegar aqui clicando em "Tempo Real" no menu. Visualização sempre
// liberada, mesmo sem acesso ao módulo — só operar fica restrito (ver
// comentário em apps/maintenance/src/app/page.tsx).
export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }
  const podeOperar = await hasModuleAccess(session, "HOUSEKEEPING");

  return <BurndownChart role={session.role} podeOperar={podeOperar} />;
}
