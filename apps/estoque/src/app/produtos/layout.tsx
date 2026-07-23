import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";
import { Sidebar } from "@/components/layout/Sidebar";

export default async function ProdutosLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  // Volta pro hub do tenant (tiles + Sair), não pra landing genérica.
  if (!(await hasModuleAccess(session, "STOCK"))) redirect(`${process.env.NEXT_PUBLIC_GATEWAY_URL || "https://sistemaspraxis.com.br"}/${session.tenantSlug}`);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar nome={session.nome} role={session.role} tenantSlug={session.tenantSlug} />
      <main className="flex-1 overflow-y-auto estoque-content-offset">
        <div className="max-w-6xl mx-auto p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
