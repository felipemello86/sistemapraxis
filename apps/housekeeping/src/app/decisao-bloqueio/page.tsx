import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";
import DecisaoBloqueioView from "./DecisaoBloqueioView";

// Tela de Decisão de Bloqueio — pedido explícito do Felipe: "O sistema deve
// levar o usuário Atendimento a uma tela de Decisão sobre bloquear ou não".
// Visível pras 4 roles notificadas quando uma NC urgente é registrada
// (Gerente/Atendimento/Governanta/Master — ver
// packages/core/src/maintenanceUrgente.ts), mas só Atendimento/Gerente/
// Master DECIDEM (mesmo gate de /api/decisao-bloqueio PATCH); Governanta só
// acompanha (mesmo padrão de "ver sem poder operar" já usado em outras
// telas de Governança). Guard aqui é defensivo, igual às demais páginas.
const ROLES_PERMITIDOS = ["ATENDIMENTO", "GERENTE", "GOVERNANTA", "MASTER"];

export default async function DecisaoBloqueioPage() {
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

  const temAcessoModulo = await hasModuleAccess(session, "HOUSEKEEPING");
  const podeOperar = temAcessoModulo && ["ATENDIMENTO", "GERENTE", "MASTER"].includes(session.role);

  return <DecisaoBloqueioView podeOperar={podeOperar} />;
}
