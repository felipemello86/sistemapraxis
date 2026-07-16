import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";
import SelecaoView from "./SelecaoView";

// Seleção e liberação diária de UHs — MASTER/GERENTE selecionam e confirmam
// as UHs do dia, depois liberam conforme ficam prontas pro check-in. Portado
// de apps/housekeeping/src/app/selecao/page.tsx (v1); `role` vem por prop em
// vez do hook useSession (v2 não usa next-auth).
export default async function SelecaoPage() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }
  const podeAcessar = await hasModuleAccess(session, "HOUSEKEEPING");
  if (!podeAcessar) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }

  return <SelecaoView role={session.role} />;
}
