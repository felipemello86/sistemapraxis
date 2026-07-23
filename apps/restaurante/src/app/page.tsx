import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";

// Rota raiz do módulo (vira "/restaurante" com o basePath) — pra onde o
// tile "Restaurante" do hub do gateway leva. Sem UI própria, só despacha
// pro Kanban (tela principal do módulo).
export default async function RestauranteHome() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }

  const podeAcessar = await hasModuleAccess(session, "RESTAURANT");
  if (!podeAcessar) {
    // Volta pro hub do próprio tenant (tiles + Sair), não pra landing
    // genérica do domínio raiz — essa não tem navegação nenhuma.
    redirect(`${process.env.NEXT_PUBLIC_GATEWAY_URL || "https://sistemaspraxis.com.br"}/${session.tenantSlug}`);
  }

  redirect("/kanban");
}
