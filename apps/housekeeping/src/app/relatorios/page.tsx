import { redirect } from "next/navigation";
import { getSession } from "@praxis/core";
import RelatoriosView from "./RelatoriosView";

// Portado de apps/housekeeping/src/app/relatorios/page.tsx (v1).
export default async function RelatoriosPage() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }
  // Tela só de leitura (gera/consulta relatórios) — visualização liberada
  // mesmo sem acesso ao módulo (ver comentário em apps/maintenance/src/app/page.tsx).

  return <RelatoriosView />;
}
