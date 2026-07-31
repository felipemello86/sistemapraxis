import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";

// Rota raiz do módulo (vira "/recepcao" com o basePath) — pra onde o tile
// "Recepção" do hub do gateway leva. Sem UI própria, só despacha pra
// Calendário (visão padrão — ver CalendarioView.tsx); a lista plana em
// /reservas continua acessível pelo menu lateral.
export default async function RecepcaoHome() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }

  const podeAcessar = await hasModuleAccess(session, "RECEPTION");
  if (!podeAcessar) {
    // Volta pro hub do próprio tenant (tiles + Sair), não pra landing
    // genérica do domínio raiz — essa não tem navegação nenhuma.
    redirect(`${process.env.NEXT_PUBLIC_GATEWAY_URL || "https://sistemaspraxis.com.br"}/${session.tenantSlug}`);
  }

  redirect("/calendario");
}
