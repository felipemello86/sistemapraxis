import { redirect } from "next/navigation";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";
import { ConfiguracoesClient } from "@/components/configuracoes/ConfiguracoesClient";

// Portado de apps/booking-reviews/src/app/(app)/configuracoes/page.tsx (v1),
// reduzido a Meta de nota + Categorias — ver comentário em actions.ts sobre
// por que Usuários, Propriedades e Telegram saíram (tudo centralizado no
// gateway).
export default async function ConfiguracoesPage() {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");

  const podeAcessar = await hasModuleAccess(session, "BOOKING_REVIEWS");
  if (!podeAcessar) redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");

  const [config, categories] = await Promise.all([
    prisma.reviewsConfig.findUnique({ where: { tenantId: session.tenantId } }),
    prisma.category.findMany({ where: { tenantId: session.tenantId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-800">Configurações</h1>
      <ConfiguracoesClient
        isMaster={session.role === "MASTER"}
        targetScore={config?.targetScore ?? 4.8}
        categories={categories.map((c) => ({ id: c.id, name: c.name, active: c.active }))}
      />
    </div>
  );
}
