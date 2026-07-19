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
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }

  redirect("/kanban");
}
