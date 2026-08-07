import { getSession } from "@praxis/core";
import { TransacoesFluxoView } from "./TransacoesFluxoView";

// Server component só pra repassar o role de quem está logado pro client
// (GERENTE e MASTER veem ações diferentes no kanban — ver
// TransacoesFluxoView) — mesmo motivo de Sidebar.tsx receber `role` como
// prop em vez de refazer a sessão no cliente.
export default async function TransacoesPage() {
  const session = await getSession();
  return <TransacoesFluxoView role={session?.role ?? ""} />;
}
