import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";
import { Sidebar } from "@/components/layout/Sidebar";

export default async function LancamentosLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  if (!(await hasModuleAccess(session, "FINANCE"))) redirect(`${process.env.NEXT_PUBLIC_GATEWAY_URL || "https://sistemaspraxis.com.br"}/${session.tenantSlug}`);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar nome={session.nome} role={session.role} tenantSlug={session.tenantSlug} />
      <main className="flex-1 overflow-y-auto financeiro-content-offset">
        {/* h-full + flex aqui pra Lançamentos poder esticar a tabela até
            preencher o resto da tela (pedido do Felipe, 05/08/2026: "tem
            uma parte da tela que poderia ser ocupada por mais linhas") — a
            LancamentosView usa isso pra fazer só a tabela rolar, com
            cabeçalho fixo, em vez de sobrar espaço em branco embaixo. */}
        <div className="max-w-6xl mx-auto p-4 md:p-6 h-full flex flex-col">{children}</div>
      </main>
    </div>
  );
}
