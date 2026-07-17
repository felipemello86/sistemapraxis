import { redirect } from "next/navigation";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";
import { Dashboard } from "@/components/dashboard";
import type { ChecklistItem, InspecaoComUnidade, UnitOption } from "@/lib/types";

// Portado de apps/maintenance/src/app/page.tsx (v1). Era um único ponto de
// entrada lá (view trocada client-side via useState, ver components/dashboard.tsx)
// — continua assim aqui, sem virar rotas separadas por tela como Governança/
// Avaliações, porque não havia motivo pra mudar isso nesta fatia.
//
// Diferença central: sem NextAuth — sessão/guard de módulo vêm do
// @praxis/core, igual todo o resto da v2. "Unidades" já não é um model local
// (Unit): busca direto o UH do gateway, tenant-scoped e ativo.
export default async function Home() {
  const session = await getSession();
  if (!session) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }
  const podeAcessar = await hasModuleAccess(session, "MAINTENANCE");
  if (!podeAcessar) {
    redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");
  }

  const [uhs, checklistItems, inspections] = await Promise.all([
    prisma.uH.findMany({
      where: { tenantId: session.tenantId, ativo: true },
      orderBy: { ordem: "asc" },
    }),
    prisma.maintenanceChecklistItem.findMany({
      where: { tenantId: session.tenantId },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.maintenanceInspection.findMany({
      where: { tenantId: session.tenantId },
      include: {
        uh: { select: { id: true, numero: true } },
        inspector: { select: { id: true, nome: true } },
        items: true,
      },
      orderBy: { date: "desc" },
      // relationJoins ligado no schema compartilhado (ver
      // packages/core/prisma/schema.prisma).
      relationLoadStrategy: "join",
    }),
  ]);

  const unidades: UnitOption[] = uhs.map((u) => ({ id: u.id, name: u.numero }));

  const itens: ChecklistItem[] = checklistItems.map((it) => ({
    id: it.id,
    name: it.name,
    category: it.category,
    subDescription: it.subDescription,
  }));

  const inspecoes: InspecaoComUnidade[] = inspections.map((insp) => ({
    id: insp.id,
    date: insp.date.toISOString(),
    unitId: insp.uhId,
    unit: { id: insp.uh.id, name: insp.uh.numero },
    inspectorId: insp.inspectorId,
    inspector: insp.inspector ? { id: insp.inspector.id, name: insp.inspector.nome } : null,
    items: insp.items.map((it) => ({
      id: it.id,
      checklistItemId: it.checklistItemId,
      status: it.status as "CONFORME" | "NAO_CONFORME",
      comment: it.comment,
    })),
  }));

  return (
    <Dashboard
      user={{
        name: session.nome,
        email: session.email,
        role: session.role,
        tenantSlug: session.tenantSlug,
      }}
      unidades={unidades}
      itens={itens}
      inspecoes={inspecoes}
    />
  );
}
