import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@praxis/core";
import { Sidebar } from "@/components/layout/Sidebar";

export default async function DecisaoBloqueioLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");

  // Lido no servidor pra Sidebar já nascer no estado certo (sem flash de
  // expandida→recolhida) — ver comentário em components/layout/Sidebar.tsx.
  const initialCollapsed = cookies().get("praxis-housekeeping-sidebar-collapsed")?.value === "1";

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar nome={session.nome} role={session.role} tenantSlug={session.tenantSlug} initialCollapsed={initialCollapsed} />
      <main className="flex-1 overflow-auto hk-content-offset">{children}</main>
    </div>
  );
}
