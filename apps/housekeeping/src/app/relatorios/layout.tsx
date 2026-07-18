import { redirect } from "next/navigation";
import { getSession } from "@praxis/core";
import { Sidebar } from "@/components/layout/Sidebar";

// Portado de apps/housekeeping/src/app/relatorios/layout.tsx (v1) — mesmo
// padrão de layout usado em movimentos/logs/configuracoes.
export default async function RelatoriosLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar nome={session.nome} role={session.role} tenantSlug={session.tenantSlug} />
      <main className="flex-1 overflow-y-auto hk-content-offset">
        <div className="max-w-7xl mx-auto p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
