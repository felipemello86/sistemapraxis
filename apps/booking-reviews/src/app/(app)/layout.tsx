import { redirect } from "next/navigation";
import { getSession } from "@praxis/core";
import { Header } from "@/components/layout/Header";

// Portado de apps/booking-reviews/src/app/(app)/layout.tsx (v1) — mesmo
// route group, guard de sessão igual ao resto da suíte v2 (getSession() de
// @praxis/core em vez do JWT local + cookie SSO que o v1 tinha).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");

  return (
    <div className="min-h-screen bg-slate-50">
      <Header nome={session.nome} role={session.role} tenantSlug={session.tenantSlug} />
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 overflow-x-hidden">{children}</main>
    </div>
  );
}
