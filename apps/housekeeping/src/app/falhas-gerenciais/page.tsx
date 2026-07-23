import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";
import FalhasGerenciaisView from "./FalhasGerenciaisView";

// Kanban "Falhas Gerenciais" — pedido explícito do Felipe: só
// Governanta/Gerente/Master acompanham e resolvem (a Governanta é quem
// registra a falha na inspeção; camareira nem sabe que essa tela existe —
// ver filtro por role em Sidebar.tsx). Guard aqui é defensivo (a pessoa
// poderia digitar a URL direto mesmo sem o link no menu).
const ROLES_PERMITIDOS = ["GOVERNANTA", "GERENTE", "MASTER"];

export default async function FalhasGerenciaisPage() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }

  if (!ROLES_PERMITIDOS.includes(session.role)) {
    return (
      <div className="p-6 max-w-lg">
        <p className="text-gray-500">Você não tem acesso a esta tela.</p>
      </div>
    );
  }

  const podeOperar = await hasModuleAccess(session, "HOUSEKEEPING");

  return <FalhasGerenciaisView podeOperar={podeOperar} />;
}
