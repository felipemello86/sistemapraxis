import { redirect } from "next/navigation";
import { getSession, hasModuleAccess } from "@praxis/core";
import { Sidebar } from "@/components/layout/Sidebar";

// Gate de sessão + módulo compartilhado pelos layouts de rota internos
// (por enquanto só /reservas — ver Fase 1 do plano). Mesmo padrão de
// apps/restaurante/src/components/layout/ModuleShell.tsx.
export async function ModuleShell({
  children,
  largo,
}: {
  children: React.ReactNode;
  // Telas densas (ex.: Calendário, grid dia x UH) usam a largura cheia em
  // vez do max-w-6xl centralizado padrão — passar largo aqui em vez de
  // mexer no valor default, pra Reservas e telas futuras continuarem com a
  // largura de leitura confortável de sempre.
  largo?: boolean;
}) {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  if (!(await hasModuleAccess(session, "RECEPTION"))) {
    redirect(`${process.env.NEXT_PUBLIC_GATEWAY_URL || "https://sistemaspraxis.com.br"}/${session.tenantSlug}`);
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar nome={session.nome} role={session.role} tenantSlug={session.tenantSlug} />
      <main className="flex-1 overflow-y-auto recepcao-content-offset">
        <div className={largo ? "w-full p-4 md:p-6" : "max-w-6xl mx-auto p-4 md:p-6"}>{children}</div>
      </main>
    </div>
  );
}
