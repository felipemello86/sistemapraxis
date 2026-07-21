import { redirect } from "next/navigation";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";
import { Dashboard } from "@/components/dashboard";
import type {
  AtribuicoesPorUnidade,
  ChecklistItem,
  CorrectionSummary,
  InspecaoComUnidade,
  MaintenanceConfigView,
  UnitOption,
} from "@/lib/types";

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

  const [uhs, checklistItems, inspections, unitChecklistItems, corrections, config] = await Promise.all([
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
    // Atribuição de item por UH (ver comentário em MaintenanceUnitChecklistItem
    // no schema) — ausência de linha pra uma UH = todos os itens se aplicam.
    prisma.maintenanceUnitChecklistItem.findMany({
      where: { tenantId: session.tenantId },
      select: { uhId: true, checklistItemId: true },
    }),
    // Últimas correções registradas (Rota de Correção) — histórico exibido
    // na própria tela, mesmo padrão do PageCorrecao do protótipo standalone.
    prisma.maintenanceCorrection.findMany({
      where: { tenantId: session.tenantId },
      include: {
        uh: { select: { id: true, numero: true } },
        checklistItem: { select: { id: true, name: true } },
        author: { select: { id: true, nome: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    // Prazo máximo entre inspeções e meta de conformidade — pode não existir
    // ainda pra tenants antigos (upsert só cria na primeira vez que alguém
    // edita em Configurações); usamos o mesmo default 90/90 do schema até lá.
    prisma.maintenanceConfig.findUnique({
      where: { tenantId: session.tenantId },
      select: { maxDaysBetweenInspections: true, goal: true },
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
      photos: safeParsePhotos(it.photos),
      corrigidoEm: it.corrigidoEm ? it.corrigidoEm.toISOString() : null,
    })),
  }));

  const atribuicoes: AtribuicoesPorUnidade = {};
  for (const row of unitChecklistItems) {
    (atribuicoes[row.uhId] ??= []).push(row.checklistItemId);
  }

  const correcoes: CorrectionSummary[] = corrections.map((c) => ({
    id: c.id,
    uhId: c.uhId,
    uhName: c.uh.numero,
    checklistItemId: c.checklistItemId,
    checklistItemName: c.checklistItem?.name ?? null,
    description: c.description,
    photos: safeParsePhotos(c.photos),
    createdAt: c.createdAt.toISOString(),
    authorName: c.author?.nome ?? null,
  }));

  const configView: MaintenanceConfigView = {
    maxDaysBetweenInspections: config?.maxDaysBetweenInspections ?? 90,
    goal: config?.goal ?? 90,
  };

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
      atribuicoes={atribuicoes}
      correcoes={correcoes}
      config={configView}
    />
  );
}

function safeParsePhotos(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
