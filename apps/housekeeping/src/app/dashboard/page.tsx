import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";
import TempoRealTabs from "./TempoRealTabs";

// Tela "Tempo Real". Portado de
// apps/housekeeping/src/app/dashboard/page.tsx (v1). É a tela padrão do
// módulo pra quem não é CAMAREIRA (ver src/app/page.tsx, que redireciona
// pra cá como landing page default), mas isso é só o destino padrão — a
// tela em si fica visível pra qualquer cargo, incluindo CAMAREIRA, que pode
// chegar aqui clicando em "Tempo Real" no menu. Visualização sempre
// liberada, mesmo sem acesso ao módulo — só operar fica restrito (ver
// comentário em apps/maintenance/src/app/page.tsx).
//
// Ganhou 2 subtelas em 05/08/2026 (pedido do Felipe): Quadro (Kanban por UH,
// default) e Burndown (o gráfico original) — ver TempoRealTabs.tsx.
export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }
  const podeOperar = await hasModuleAccess(session, "HOUSEKEEPING");

  return <TempoRealTabs role={session.role} podeOperar={podeOperar} />;
}
