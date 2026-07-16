import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";
import AtribuicaoView from "./AtribuicaoView";

// Atribuição diária de camareiras às UHs + aprovação de solicitação de troca.
// Portado de apps/housekeeping/src/app/atribuicao/page.tsx (v1).
export default async function AtribuicaoPage() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }
  const podeAcessar = await hasModuleAccess(session, "HOUSEKEEPING");
  if (!podeAcessar) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }

  return <AtribuicaoView role={session.role} userId={session.userId} />;
}
