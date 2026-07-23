import { redirect } from "next/navigation";
import { getSession, hasModuleAccess, prisma, dataAtualSP } from "@praxis/core";
import { Dashboard } from "@/components/dashboard";
import type {
  AtribuicoesPorUnidade,
  ChecklistItem,
  CorrectionCardView,
  CorrectionSummary,
  DailyCommitmentView,
  InspecaoComUnidade,
  ItemInfo,
  ItemInfoLogEntry,
  MaintenanceConfigView,
  SupplierView,
  UhImage,
  UhSpot,
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
  // Visualização é liberada pra qualquer usuário autenticado do tenant,
  // independente de o módulo estar contratado ou de acesso individual (ver
  // hasModuleAccess) — restrição de acesso agora só bloqueia OPERAR (criar,
  // editar, excluir, iniciar inspeção etc.), nunca ver a tela. `podeOperar`
  // desce pro Dashboard e pras views que têm ações de escrita, que desabilitam
  // os botões correspondentes quando false. As Server Actions em
  // app/actions/data.ts continuam com o próprio check (requireModuleSession)
  // — a UI desabilitada aqui é só a primeira camada, não a de verdade.
  const podeOperar = await hasModuleAccess(session, "MAINTENANCE");

  const hoje = dataAtualSP();

  const [
    uhs,
    checklistItems,
    inspections,
    unitChecklistItems,
    corrections,
    config,
    uhImages,
    uhSpots,
    itemInfos,
    itemInfoLogs,
    correctionCards,
    suppliers,
    uhsLiberadasHoje,
    commitments,
  ] = await Promise.all([
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
    // Tela "UH 3D" — fotos imersivas por cômodo e spots de verificação
    // posicionados sobre elas (ver comentário em MaintenanceUhImage/
    // MaintenanceUhSpot no schema Prisma).
    prisma.maintenanceUhImage.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true, uhId: true, tipo: true, imageUrl: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.maintenanceUhSpot.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true, imageId: true, checklistItemId: true, x: true, y: true },
    }),
    // "Informações do item" (IV-UH) — ver comentário em MaintenanceItemInfo
    // no schema Prisma.
    prisma.maintenanceItemInfo.findMany({
      where: { tenantId: session.tenantId },
      include: { updatedBy: { select: { nome: true } } },
    }),
    // Log de alterações — as últimas 200 bastam pra exibir histórico por
    // item na UI (mesmo critério de "take" já usado pras correções acima).
    prisma.maintenanceItemInfoLog.findMany({
      where: { tenantId: session.tenantId },
      include: { author: { select: { nome: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    // Fluxo de Correção (Aquisição/Serviços Externos/Execução) — só cards
    // cujo item ainda está NAO_CONFORME entram aqui; um item resolvido por
    // QUALQUER caminho (UH 3D, correção antiga, ou o próprio kanban) some
    // sozinho de todo kanban por essa filtragem, sem precisar de limpeza
    // ativa (ver comentário em kanbansDoCard, packages/core).
    prisma.maintenanceCorrectionCard.findMany({
      where: { tenantId: session.tenantId, inspectionItem: { status: "NAO_CONFORME" } },
      include: {
        inspectionItem: { select: { comment: true, photos: true } },
        uh: { select: { id: true, numero: true } },
        checklistItem: { select: { id: true, name: true, category: true } },
        hiredSupplier: { select: { id: true, nome: true } },
        executedBy: { select: { nome: true } },
        quotes: {
          include: { supplier: { select: { id: true, nome: true } } },
          orderBy: { createdAt: "asc" },
        },
        schedulingLogs: {
          include: { author: { select: { nome: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.maintenanceSupplier.findMany({
      where: { tenantId: session.tenantId },
      include: { checklistItems: { select: { checklistItemId: true } } },
      orderBy: { nome: "asc" },
    }),
    // UHs liberadas pra limpeza HOJE no módulo Governança (Seleção e
    // Liberação) — leitura direta entre apps, mesmo banco (ver
    // DailyUHSelection no schema). Só essas UHs alimentam o Kanban de
    // Execução (pedido explícito).
    prisma.dailyUHSelection.findMany({
      where: { tenantId: session.tenantId, data: hoje, liberada: true },
      select: { uhId: true },
    }),
    // Compromissos diários já fechados — histórico completo pra tela
    // Performance, e o de hoje (se existir) pra saber se o Kanban de
    // Execução já está "fechado" pro dia.
    prisma.maintenanceDailyCommitment.findMany({
      where: { tenantId: session.tenantId },
      include: {
        closedBy: { select: { nome: true } },
        cards: {
          include: { uh: { select: { numero: true } }, checklistItem: { select: { name: true } } },
        },
      },
      orderBy: { data: "desc" },
    }),
  ]);

  const unidades: UnitOption[] = uhs.map((u) => ({ id: u.id, name: u.numero }));

  const uhImagesView: UhImage[] = uhImages.map((img) => ({
    id: img.id,
    uhId: img.uhId,
    tipo: img.tipo,
    imageUrl: img.imageUrl,
    createdAt: img.createdAt.toISOString(),
  }));

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

  const itemInfosView: ItemInfo[] = itemInfos.map((i) => ({
    id: i.id,
    uhId: i.uhId,
    checklistItemId: i.checklistItemId,
    info: i.info,
    photos: safeParsePhotos(i.photos),
    updatedAt: i.updatedAt.toISOString(),
    updatedByName: i.updatedBy?.nome ?? null,
  }));

  const itemInfoLogsView: ItemInfoLogEntry[] = itemInfoLogs.map((l) => ({
    id: l.id,
    uhId: l.uhId,
    checklistItemId: l.checklistItemId,
    previousInfo: l.previousInfo,
    newInfo: l.newInfo,
    previousPhotos: safeParsePhotos(l.previousPhotos),
    newPhotos: safeParsePhotos(l.newPhotos),
    authorName: l.author?.nome ?? null,
    createdAt: l.createdAt.toISOString(),
  }));

  const correctionCardsView: CorrectionCardView[] = correctionCards.map((c) => ({
    id: c.id,
    uhId: c.uhId,
    uhName: c.uh.numero,
    checklistItemId: c.checklistItemId,
    checklistItemName: c.checklistItem?.name ?? null,
    checklistItemCategory: c.checklistItem?.category ?? null,
    comment: c.inspectionItem.comment,
    photos: safeParsePhotos(c.inspectionItem.photos),
    createdAt: c.createdAt.toISOString(),
    needsMaterial: c.needsMaterial ?? false,
    needsExternalService: c.needsExternalService ?? false,
    materialStatus: c.materialStatus as "A_ADQUIRIR" | "COMPRADO",
    materialReceiptPhoto: c.materialReceiptPhoto,
    materialCompradoEm: c.materialCompradoEm ? c.materialCompradoEm.toISOString() : null,
    externalServiceStatus: c.externalServiceStatus as "A_CONTRATAR" | "EM_NEGOCIACAO" | "AGENDADO" | "EXECUTADO",
    hiredSupplierId: c.hiredSupplierId,
    hiredSupplierNome: c.hiredSupplier?.nome ?? null,
    scheduledDate: c.scheduledDate ? c.scheduledDate.toISOString() : null,
    quotes: c.quotes.map((q) => ({
      id: q.id,
      supplierId: q.supplierId,
      supplierNome: q.supplier.nome,
      createdAt: q.createdAt.toISOString(),
    })),
    schedulingLogs: c.schedulingLogs.map((l) => ({
      id: l.id,
      previousSupplierNome: l.previousSupplierNome,
      previousDate: l.previousDate ? l.previousDate.toISOString() : null,
      newSupplierNome: l.newSupplierNome,
      newDate: l.newDate ? l.newDate.toISOString() : null,
      authorName: l.author?.nome ?? null,
      createdAt: l.createdAt.toISOString(),
    })),
    executionStatus: c.executionStatus as "A_FAZER" | "PLANEJADA" | "EXECUTADA",
    dailyCommitmentId: c.dailyCommitmentId,
    blockForReservation: c.blockForReservation,
    executedDescription: c.executedDescription,
    executedPhotos: safeParsePhotos(c.executedPhotos),
    executedAt: c.executedAt ? c.executedAt.toISOString() : null,
    executedByName: c.executedBy?.nome ?? null,
  }));

  const suppliersView: SupplierView[] = suppliers.map((s) => ({
    id: s.id,
    nome: s.nome,
    contato: s.contato,
    observacao: s.observacao,
    checklistItemIds: s.checklistItems.map((ci) => ci.checklistItemId),
  }));

  const commitmentsView: DailyCommitmentView[] = commitments.map((cm) => ({
    id: cm.id,
    data: cm.data,
    closedAt: cm.closedAt.toISOString(),
    closedByName: cm.closedBy?.nome ?? null,
    conformidadeAntes: cm.conformidadeAntes,
    conformidadeDepois: cm.conformidadeDepois,
    reportSentAt: cm.reportSentAt ? cm.reportSentAt.toISOString() : null,
    cards: cm.cards.map((card) => ({
      id: card.id,
      uhName: card.uh.numero,
      checklistItemName: card.checklistItem?.name ?? null,
      executionStatus: card.executionStatus as "A_FAZER" | "PLANEJADA" | "EXECUTADA",
      executedAt: card.executedAt ? card.executedAt.toISOString() : null,
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
      podeOperar={podeOperar}
      unidades={unidades}
      itens={itens}
      inspecoes={inspecoes}
      atribuicoes={atribuicoes}
      correcoes={correcoes}
      config={configView}
      uhImages={uhImagesView}
      uhSpots={uhSpots as UhSpot[]}
      itemInfos={itemInfosView}
      itemInfoLogs={itemInfoLogsView}
      inspectionItemIdsComCard={correctionCards.map((c) => c.inspectionItemId)}
      correctionCards={correctionCardsView}
      suppliers={suppliersView}
      uhIdsLiberadasHoje={uhsLiberadasHoje.map((u) => u.uhId)}
      commitments={commitmentsView}
      hojeSP={hoje}
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
