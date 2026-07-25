import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@praxis/core";
import { Sidebar } from "@/components/layout/Sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");

  // Lido no servidor pra Sidebar já nascer no estado certo (sem flash de
  // expandida→recolhida) — ver comentário em components/layout/Sidebar.tsx.
  const initialCollapsed = cookies().get("praxis-housekeeping-sidebar-collapsed")?.value === "1";

  // Diferente do layout genérico das outras telas: o gráfico do burndown usa
  // h-full internamente (ResponsiveContainer do recharts precisa de altura
  // limitada, não de scroll infinito) — por isso h-screen + overflow-hidden
  // aqui, igual ao v1 (ver apps/housekeeping/src/app/dashboard/layout.tsx lá).
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar nome={session.nome} role={session.role} tenantSlug={session.tenantSlug} initialCollapsed={initialCollapsed} />
      <main className="flex-1 overflow-hidden hk-content-offset flex flex-col">
        <div className="flex-1 min-h-0 p-3 md:p-4 flex flex-col">{children}</div>
      </main>
    </div>
  );
}
