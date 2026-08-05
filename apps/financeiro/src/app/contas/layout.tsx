import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";
import { Sidebar } from "@/components/layout/Sidebar";

export default async function ContasLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  if (!(await hasModuleAccess(session, "FINANCE"))) redirect(`${process.env.NEXT_PUBLIC_GATEWAY_URL || "https://sistemaspraxis.com.br"}/${session.tenantSlug}`);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar nome={session.nome} role={session.role} tenantSlug={session.tenantSlug} />
      <main className="flex-1 overflow-y-auto financeiro-content-offset">
        <div className="max-w-6xl mx-auto p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
