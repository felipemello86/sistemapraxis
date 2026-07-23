import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";

// Rota raiz do módulo (vira "/estoque" com o basePath) — pra onde o tile
// "Estoque" do hub do gateway leva. Sem UI própria, só despacha pra
// Produtos (tela principal do módulo).
export default async function EstoqueHome() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }

  const podeAcessar = await hasModuleAccess(session, "STOCK");
  if (!podeAcessar) {
    // Volta pro hub do próprio tenant (tiles + Sair), não pra landing
    // genérica do domínio raiz — essa não tem navegação nenhuma.
    redirect(`${process.env.NEXT_PUBLIC_GATEWAY_URL || "https://sistemaspraxis.com.br"}/${session.tenantSlug}`);
  }

  redirect("/dashboard");
}
