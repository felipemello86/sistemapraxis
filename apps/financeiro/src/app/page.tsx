import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";

// Rota raiz do módulo (vira "/financeiro" com o basePath) — pra onde o tile
// "Financeiro" do hub do gateway leva. Sem UI própria, só despacha pra DRE
// (tela principal do módulo, requisito 1 do Felipe: "DRE viva").
export default async function FinanceiroHome() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }

  const podeAcessar = await hasModuleAccess(session, "FINANCE");
  if (!podeAcessar) {
    // Volta pro hub do próprio tenant (tiles + Sair), não pra landing
    // genérica do domínio raiz — essa não tem navegação nenhuma.
    redirect(`${process.env.NEXT_PUBLIC_GATEWAY_URL || "https://sistemaspraxis.com.br"}/${session.tenantSlug}`);
  }

  redirect("/dre");
}
