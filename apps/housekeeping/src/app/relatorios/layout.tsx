import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@praxis/core";
import { Sidebar } from "@/components/layout/Sidebar";

// Portado de apps/housekeeping/src/app/relatorios/layout.tsx (v1) — mesmo
// padrão de layout usado em movimentos/logs/configuracoes.
export default async function RelatoriosLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");

  // Lido no servidor pra Sidebar já nascer no estado certo (sem flash de
  // expandida→recolhida) — ver comentário em components/layout/Sidebar.tsx.
  const initialCollapsed = cookies().get("praxis-housekeeping-sidebar-collapsed")?.value === "1";

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar nome={session.nome} role={session.role} tenantSlug={session.tenantSlug} initialCollapsed={initialCollapsed} />
      <main className="flex-1 overflow-y-auto hk-content-offset">
        <div className="max-w-7xl mx-auto p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
