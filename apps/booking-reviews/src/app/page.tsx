import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";

// Portado de apps/booking-reviews/src/app/page.tsx (v1) — lá redirecionava
// pra /dashboard (com sessão) ou /api/auth/silent (sem). Aqui não existe
// mais ponte de login silencioso por app — getSession() já lê o cookie
// único compartilhado direto. Dashboard ainda não foi portado (bloco
// seguinte), então por enquanto o pouso é direto em /tratamento.
export default async function RootPage() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }
  const podeAcessar = await hasModuleAccess(session, "BOOKING_REVIEWS");
  if (!podeAcessar) {
    // Volta pro hub do próprio tenant (com os tiles que ela tem acesso e o
    // botão Sair), não pra landing genérica do domínio raiz — essa não tem
    // nenhuma navegação, é um beco sem saída pra quem cai aqui sem
    // permissão (ver Header.tsx, hubUrl()).
    redirect(`${process.env.NEXT_PUBLIC_GATEWAY_URL || "https://sistemaspraxis.com.br"}/${session.tenantSlug}`);
  }

  redirect("/tratamento");
}
