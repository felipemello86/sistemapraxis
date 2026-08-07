import { getSession } from "@praxis/core";
import { TransacoesView } from "./TransacoesView";

// Server component só pra repassar o role de quem está logado pro client
// (GERENTE e MASTER veem ações diferentes na fila de aprovação — ver
// TransacoesView) — mesmo motivo de Sidebar.tsx receber `role` como prop
// em vez de refazer a sessão no cliente.
export default async function TransacoesPage() {
  const session = await getSession();
  return <TransacoesView role={session?.role ?? ""} nome={session?.nome ?? ""} />;
}
