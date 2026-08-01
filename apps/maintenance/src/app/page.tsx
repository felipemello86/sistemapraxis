import { redirect } from "next/navigation";
import { getSession, hasModuleAccess, prisma, dataAtualSP } from "@praxis/core";
import { Dashboard } from "@/components/dashboard";
import type {
  AtribuicoesPorUnidade,
  ChecklistItem,
  ConformitySnapshot,
  CorrectionCardView,
  CorrectionSummary,
  DailyCommitmentView,
  InspecaoComUnidade,
  ItemInfo,
  ItemInfoLogEntry,
  LogEvento,
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

  // Janela do gráfico "Capacidade Produtiva" (tela Performance) — 30 dias (1
  // mês, reduzida dos 90 dias/3 meses originais a pedido do Felipe; ver
  // DIAS_JANELA_CAPACIDADE em components/views/performance.tsx). Corte com
  // folga de 100 dias (bem mais que os 30 exibidos) porque: (a) o bucket por
  // dia é feito no client em horário local, mesmo critério de isoLocal em
  // evolucao.tsx — evita perder o primeiro dia por causa da diferença de
  // fuso entre o corte aqui (servidor) e o agrupamento lá; (b) cada dia
  // exibido é uma MÉDIA MÓVEL dos 7 dias anteriores (pedido explícito do
  // Felipe) — o primeiro dia da janela também precisa de 6 dias de histórico
  // ANTES dele pra ter uma média completa (ver serieCapacidade em
  // components/views/performance.tsx). A folga de 100 é generosa de sobra;
  // não precisou ser reduzida junto com a janela.
  const cutoffCapacidade = new Date();
  cutoffCapacidade.setDate(cutoffCapacidade.getDate() - 100);

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
    uhsSelecionadasHoje,
    commitments,
    conformitySnapshots,
    allCardsForLog,
    auditEvents,
    ncSurgidasBrutas,
    ncEliminadasBrutas,
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
        inspectionItem: { select: { comment: true, photos: true, urgente: true } },
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
    // UHs SELECIONADAS pra hoje no módulo Governança (Seleção e Liberação)
    // — leitura direta entre apps, mesmo banco (ver DailyUHSelection no
    // schema). Alimenta o "A Fazer" do Kanban de Execução (pedido
    // explícito). Antes filtrava por liberada:true, mas a seleção do dia
    // PRECEDE a liberação (uma UH pode estar selecionada e ainda não
    // liberada) — o técnico deve ver o card assim que a UH entra na
    // programação do dia, sem esperar a governança liberar de fato.
    // temReserva e liberada vêm juntos (mesma linha) — mesmas flags "Com
    // Reserva" e "Liberada" da tela Seleção e Liberação, exibidas nos cards
    // de Correção (pedido explícito).
    prisma.dailyUHSelection.findMany({
      where: { tenantId: session.tenantId, data: hoje },
      select: { uhId: true, temReserva: true, liberada: true },
    }),
    // Compromissos diários já fechados — histórico completo pra tela
    // Performance, e o de hoje (se existir) pra saber se o Kanban de
    // Execução já está "fechado" pro dia.
    prisma.maintenanceDailyCommitment.findMany({
      where: { tenantId: session.tenantId },
      include: {
        closedBy: { select: { nome: true } },
        cards: {
          include: {
            uh: { select: { numero: true } },
            checklistItem: { select: { name: true } },
            inspectionItem: { select: { urgente: true } },
          },
        },
      },
      orderBy: { data: "desc" },
    }),
    // Fallback decorativo pro gráfico "Conformidade ao longo do tempo" (ver
    // comentário completo no schema, model MaintenanceConformitySnapshot) —
    // só usado nos dias sem nenhuma inspeção real ainda (ver serieDiaria em
    // components/views/evolucao.tsx).
    prisma.maintenanceConformitySnapshot.findMany({
      where: { tenantId: session.tenantId },
      select: { data: true, conformidade: true },
    }),
    // Tela "Log do Sistema" — diferente do fetch `correctionCards` acima
    // (só itens ainda NAO_CONFORME, pro kanban), este traz TODO card já
    // criado, resolvido ou não, pra reconstruir o histórico completo de
    // criação/triagem/execução/reagendamento (pedido explícito do Felipe:
    // "já incluindo os logs antigos"). Select enxuto — a timeline só
    // precisa de nome/data/autor, não das fotos/orçamentos completos que o
    // Kanban usa.
    prisma.maintenanceCorrectionCard.findMany({
      where: { tenantId: session.tenantId },
      select: {
        id: true,
        createdAt: true,
        triagedAt: true,
        needsMaterial: true,
        needsExternalService: true,
        executedAt: true,
        executedDescription: true,
        uh: { select: { numero: true } },
        checklistItem: { select: { name: true } },
        inspectionItem: { select: { comment: true, urgente: true } },
        triagedBy: { select: { nome: true } },
        executedBy: { select: { nome: true } },
        schedulingLogs: {
          select: {
            id: true,
            createdAt: true,
            previousSupplierNome: true,
            previousDate: true,
            newSupplierNome: true,
            newDate: true,
            author: { select: { nome: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Tela "Log do Sistema" — segunda fonte, complementar aos fetches acima.
    // Cobre os pontos que NÃO tinham tabela de origem óbvia pra reconstruir
    // (fechamento/reabertura de programação, compra de material, cotação,
    // 1º agendamento, card intempestivo, edição de spot já não-conforme,
    // CRUD de UH 3D, CRUD de item de catálogo, atribuição de itens por UH,
    // config) — pedido explícito do Felipe: cobertura completa de auditoria.
    // Instrumentado via emitEvent() direto nas Server Actions (ver
    // apps/maintenance/src/app/actions/correcao.ts e data.ts). Sem filtro de
    // data — mesmo critério "sem janela" das outras queries desta tela
    // (inspections, allCardsForLog, itemInfoLogs), pra não "esconder"
    // eventos antigos da timeline. Eventos de outros eventTypes (ex.:
    // "maintenance.nc.created", "maintenance.uh.solicitacao_bloqueio" —
    // emitidos por packages/core pra alimentar a IA, não pra esta tela) são
    // ignorados no mapeamento abaixo (aiLogTipoPorEventType não os lista),
    // pra não duplicar o que os 7 tipos "clássicos" já cobrem.
    prisma.aiEvent.findMany({
      where: { tenantId: session.tenantId, module: "MAINTENANCE" },
      select: { id: true, eventType: true, payload: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    // Gráfico "Capacidade Produtiva" (tela Performance) — pedido explícito do
    // Felipe: NC surgidas vs eliminadas por dia. "Surgida" = createdAt do
    // card de Correção, que nasce no instante em que um item vira
    // NAO_CONFORME, em QUALQUER ponto de entrada (Inspeção, UH 3D, NC
    // avulsa, flag de Manutenção via Governança) — ver
    // packages/core/src/maintenanceCorrection.ts, createCorrectionCardForItem.
    prisma.maintenanceCorrectionCard.findMany({
      where: { tenantId: session.tenantId, createdAt: { gte: cutoffCapacidade } },
      select: { createdAt: true },
    }),
    // "Eliminada" = createdAt de MaintenanceCorrection — a ÚNICA tabela que
    // cobre todos os caminhos de resolução (kanban Execução/Serviços
    // Externos, botão Corrigir, edição direta via UH 3D). Diferente de
    // MaintenanceCorrectionCard.executedAt, que fica desatualizado no
    // caminho de edição via UH 3D (editarSpotInspecaoImpl não toca no card).
    prisma.maintenanceCorrection.findMany({
      where: { tenantId: session.tenantId, createdAt: { gte: cutoffCapacidade } },
      select: { createdAt: true },
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
    avulsa: insp.avulsa,
    items: insp.items.map((it) => ({
      id: it.id,
      checklistItemId: it.checklistItemId,
      status: it.status as "CONFORME" | "NAO_CONFORME",
      comment: it.comment,
      photos: safeParsePhotos(it.photos),
      corrigidoEm: it.corrigidoEm ? it.corrigidoEm.toISOString() : null,
      urgente: it.urgente,
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

  // Extraído em função (em vez de inline no .map) porque agora tem duas
  // fontes: correctionCards (o fetch principal, só itens ainda NAO_CONFORME)
  // e executedTodayCards (fetch à parte, ver comentário mais abaixo) — ambos
  // têm exatamente o mesmo shape de include, então a conversão é idêntica.
  function toCorrectionCardView(c: (typeof correctionCards)[number]): CorrectionCardView {
    return {
      id: c.id,
      uhId: c.uhId,
      uhName: c.uh.numero,
      checklistItemId: c.checklistItemId,
      checklistItemName: c.checklistItem?.name ?? null,
      checklistItemCategory: c.checklistItem?.category ?? null,
      comment: c.inspectionItem.comment,
      photos: safeParsePhotos(c.inspectionItem.photos),
      createdAt: c.createdAt.toISOString(),
      urgente: c.inspectionItem.urgente,
      needsMaterial: c.needsMaterial,
      needsExternalService: c.needsExternalService,
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
      previsto: c.previsto,
      canceladoPorLiberacao: c.canceladoPorLiberacao,
      executedDescription: c.executedDescription,
      executedPhotos: safeParsePhotos(c.executedPhotos),
      executedAt: c.executedAt ? c.executedAt.toISOString() : null,
      executedByName: c.executedBy?.nome ?? null,
    };
  }

  const correctionCardsView: CorrectionCardView[] = correctionCards.map(toCorrectionCardView);

  // Cards executados HOJE — busca à parte porque o fetch principal
  // (correctionCards, acima) só traz itens ainda NAO_CONFORME (pedido
  // explícito documentado ali: um item resolvido por qualquer caminho some
  // sozinho de todo kanban). Isso inclui a própria coluna "Executadas" do
  // Kanban de Execução, que ficava sempre vazia mesmo com cards executados
  // de verdade (bug relatado pelo Felipe: "pq as atividades n aparecem como
  // Executadas?" — os cards tinham executionStatus=EXECUTADA e
  // dailyCommitmentId certo, só não chegavam nem a ser buscados do banco).
  // Corrigido buscando à parte, sem tocar no fetch principal (que também
  // alimenta Aquisição/Serviços/A Processar/A Fazer e o relatório de
  // Performance — mudar o filtro ali reabriria cards antigos já resolvidos
  // nesses lugares, o que não é o pedido). Passado como prop separada
  // (cardsExecutadasHoje) só pro Kanban de Execução usar — não entra no
  // `cards` genérico de Correcao.tsx, então não polui Aquisição/Serviços
  // nem o contador da aba.
  const commitmentHojeId = commitments.find((cm) => cm.data === hoje)?.id ?? null;
  const executedTodayCards = commitmentHojeId
    ? await prisma.maintenanceCorrectionCard.findMany({
        where: { tenantId: session.tenantId, executionStatus: "EXECUTADA", dailyCommitmentId: commitmentHojeId },
        include: {
          inspectionItem: { select: { comment: true, photos: true, urgente: true } },
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
        orderBy: { executedAt: "desc" },
      })
    : [];
  const cardsExecutadasHojeView: CorrectionCardView[] = executedTodayCards.map(toCorrectionCardView);

  const suppliersView: SupplierView[] = suppliers.map((s) => ({
    id: s.id,
    nome: s.nome,
    contato: s.contato,
    observacao: s.observacao,
    checklistItemIds: s.checklistItems.map((ci) => ci.checklistItemId),
  }));

  // "Não-conformidades identificadas no dia" do relatório de Performance —
  // agrupa os cards de Correção (já buscados acima, e já filtrados por
  // inspectionItem.status "NAO_CONFORME", ou seja, ainda em aberto) pelo dia
  // (fuso America/Sao_Paulo) em que foram criados, sem precisar de uma nova
  // consulta ao banco. Estado "ao vivo": um card criado num dia mas resolvido
  // depois já não aparece mais aqui (o filtro NAO_CONFORME já cuidou disso),
  // mesmo critério de "estado atual" já usado por commitment.cards abaixo.
  const naoConformidadesPorDia = new Map<string, typeof correctionCards>();
  for (const c of correctionCards) {
    const dia = c.createdAt.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const lista = naoConformidadesPorDia.get(dia) ?? [];
    lista.push(c);
    naoConformidadesPorDia.set(dia, lista);
  }

  const commitmentsView: DailyCommitmentView[] = commitments.map((cm) => ({
    id: cm.id,
    data: cm.data,
    closedAt: cm.closedAt.toISOString(),
    closedByName: cm.closedBy?.nome ?? null,
    conformidadeAntes: cm.conformidadeAntes,
    conformidadeDepois: cm.conformidadeDepois,
    reportSentAt: cm.reportSentAt ? cm.reportSentAt.toISOString() : null,
    totalPrevisto: cm.totalPrevisto,
    cards: cm.cards.map((card) => ({
      id: card.id,
      uhName: card.uh.numero,
      checklistItemName: card.checklistItem?.name ?? null,
      executionStatus: card.executionStatus as "A_FAZER" | "PLANEJADA" | "EXECUTADA",
      executedAt: card.executedAt ? card.executedAt.toISOString() : null,
      urgente: card.inspectionItem.urgente,
      previsto: card.previsto,
    })),
    naoConformidadesIdentificadas: (naoConformidadesPorDia.get(cm.data) ?? []).map((c) => ({
      id: c.id,
      uhName: c.uh.numero,
      checklistItemName: c.checklistItem?.name ?? null,
      comment: c.inspectionItem.comment,
      createdAt: c.createdAt.toISOString(),
      urgente: c.inspectionItem.urgente,
    })),
    uhsEmAtraso: cm.uhsEmAtrasoSnapshot ? JSON.parse(cm.uhsEmAtrasoSnapshot) : null,
  }));

  const conformitySnapshotsView: ConformitySnapshot[] = conformitySnapshots.map((s) => ({
    data: s.data,
    conformidade: s.conformidade,
  }));

  // Log do Sistema — timeline montada a partir dos dados já buscados acima
  // (inspections, allCardsForLog, itemInfoLogs), sem tabela de auditoria
  // dedicada, mesmo padrão da tela equivalente de Housekeeping. uhNumeroPorId
  // /itemNomePorId só existem pra resolver itemInfoLogs, que não inclui esses
  // nomes na própria query (ver comentário nela acima).
  const uhNumeroPorId = new Map(uhs.map((u) => [u.id, u.numero]));
  const itemNomePorId = new Map(checklistItems.map((i) => [i.id, i.name]));

  const logEventos: LogEvento[] = [];

  for (const insp of inspections) {
    const ncCount = insp.items.filter((it) => it.status === "NAO_CONFORME").length;
    logEventos.push({
      id: `insp-${insp.id}`,
      tipo: insp.avulsa ? "relato_avulso" : "inspecao",
      timestamp: insp.date.toISOString(),
      uhNumero: insp.uh.numero,
      itemNome: null,
      atorNome: insp.inspector?.nome ?? null,
      detalhe: insp.avulsa
        ? insp.items[0]?.comment ?? "Relato avulso registrado."
        : `Inspeção completa — ${ncCount} não conformidade${ncCount === 1 ? "" : "s"} de ${insp.items.length} ${insp.items.length === 1 ? "item verificado" : "itens verificados"}.`,
      urgente: insp.items.some((it) => it.status === "NAO_CONFORME" && it.urgente),
    });
  }

  for (const c of allCardsForLog) {
    const itemNome = c.checklistItem?.name ?? "Relato avulso";
    const urgente = c.inspectionItem.urgente;
    logEventos.push({
      id: `card-criado-${c.id}`,
      tipo: "correcao_criada",
      timestamp: c.createdAt.toISOString(),
      uhNumero: c.uh.numero,
      itemNome,
      atorNome: null,
      detalhe: c.inspectionItem.comment,
      urgente,
    });
    if (c.triagedAt) {
      logEventos.push({
        id: `card-triado-${c.id}`,
        tipo: "correcao_triada",
        timestamp: c.triagedAt.toISOString(),
        uhNumero: c.uh.numero,
        itemNome,
        atorNome: c.triagedBy?.nome ?? null,
        detalhe: `Precisa de material: ${c.needsMaterial ? "sim" : "não"} · Precisa de serviço externo: ${c.needsExternalService ? "sim" : "não"}`,
        urgente,
      });
    }
    if (c.executedAt) {
      logEventos.push({
        id: `card-executado-${c.id}`,
        tipo: "correcao_executada",
        timestamp: c.executedAt.toISOString(),
        uhNumero: c.uh.numero,
        itemNome,
        atorNome: c.executedBy?.nome ?? null,
        detalhe: c.executedDescription,
        urgente,
      });
    }
    for (const l of c.schedulingLogs) {
      const de = l.previousSupplierNome ?? (l.previousDate ? new Date(l.previousDate).toLocaleDateString("pt-BR") : "—");
      const para = l.newSupplierNome ?? (l.newDate ? new Date(l.newDate).toLocaleDateString("pt-BR") : "—");
      logEventos.push({
        id: `sched-${l.id}`,
        tipo: "reagendamento",
        timestamp: l.createdAt.toISOString(),
        uhNumero: c.uh.numero,
        itemNome,
        atorNome: l.author?.nome ?? null,
        detalhe: `${de} → ${para}`,
        urgente,
      });
    }
  }

  for (const l of itemInfoLogs) {
    logEventos.push({
      id: `info-${l.id}`,
      tipo: "info_editada",
      timestamp: l.createdAt.toISOString(),
      uhNumero: uhNumeroPorId.get(l.uhId) ?? "—",
      itemNome: itemNomePorId.get(l.checklistItemId) ?? null,
      atorNome: l.author?.nome ?? null,
      detalhe: l.newInfo,
      urgente: false,
    });
  }

  // A partir de AiEvent (ver query `auditEvents` acima) — eventType ->
  // LogEvento['tipo']. Só os eventTypes "maintenance.log.*" instrumentados
  // pra esta tela entram aqui; qualquer outro eventType que caia em
  // AiEvent (ex.: os que packages/core emite pra alimentar a IA) é
  // ignorado, de propósito, pra não duplicar os 7 tipos "clássicos" acima.
  const aiLogTipoPorEventType: Record<string, LogEvento["tipo"]> = {
    "maintenance.log.programacao_fechada": "programacao_fechada",
    "maintenance.log.programacao_reaberta": "programacao_reaberta",
    "maintenance.log.card_urgente_adicionado": "card_urgente_adicionado",
    "maintenance.log.material_comprado": "material_comprado",
    "maintenance.log.cotacao_registrada": "cotacao_registrada",
    "maintenance.log.servico_agendado": "servico_agendado",
    "maintenance.log.spot_editado": "spot_editado",
    "maintenance.log.uh3d_imagem_criada": "uh3d_imagem",
    "maintenance.log.uh3d_imagem_excluida": "uh3d_imagem",
    "maintenance.log.uh3d_spot_criado": "uh3d_spot",
    "maintenance.log.uh3d_spot_movido": "uh3d_spot",
    "maintenance.log.uh3d_spot_excluido": "uh3d_spot",
    "maintenance.log.item_catalogo_criado": "item_catalogo_editado",
    "maintenance.log.item_catalogo_editado": "item_catalogo_editado",
    "maintenance.log.item_catalogo_excluido": "item_catalogo_editado",
    "maintenance.log.atribuicao_editada": "atribuicao_editada",
    "maintenance.log.config_editada": "config_editada",
  };

  // Mesmo limite (6 nomes + "+N") usado tanto pra lista de UHs do
  // fechamento/reabertura de programação quanto pra lista de itens da
  // atribuição por UH — evita o card da timeline virar uma parede de texto
  // quando o fechamento/atribuição envolve muitos cards/itens de uma vez.
  function limitarLista(nomes: string[], max = 6): string {
    if (nomes.length === 0) return "—";
    if (nomes.length <= max) return nomes.join(", ");
    return `${nomes.slice(0, max).join(", ")} +${nomes.length - max}`;
  }

  for (const ev of auditEvents) {
    const tipo = aiLogTipoPorEventType[ev.eventType];
    if (!tipo) continue;

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(ev.payload) as Record<string, unknown>;
    } catch {
      payload = {};
    }

    let uhNumero = typeof payload.uhNumero === "string" ? payload.uhNumero : "—";
    let itemNome = typeof payload.itemNome === "string" ? payload.itemNome : null;
    const atorNome = typeof payload.atorNome === "string" ? payload.atorNome : null;
    let detalhe: string | null = null;

    switch (tipo) {
      case "programacao_fechada": {
        const cards = Array.isArray(payload.cards) ? (payload.cards as { uhNumero: string }[]) : [];
        uhNumero = cards.length === 1 ? cards[0].uhNumero : `${cards.length} UHs`;
        itemNome = null;
        detalhe = `Programação fechada por ${String(payload.fechadoPor ?? "—")} — ${cards.length} ${cards.length === 1 ? "card" : "cards"}: ${limitarLista(cards.map((c) => c.uhNumero))}.`;
        break;
      }
      case "programacao_reaberta": {
        const cards = Array.isArray(payload.cards) ? (payload.cards as { uhNumero: string }[]) : [];
        uhNumero = cards.length === 1 ? cards[0].uhNumero : `${cards.length} UHs`;
        itemNome = null;
        detalhe = `Programação reaberta por ${String(payload.reabertoPor ?? "—")} (fechada originalmente por ${String(payload.fechadoPor ?? "—")}) — ${cards.length} ${cards.length === 1 ? "card" : "cards"}: ${limitarLista(cards.map((c) => c.uhNumero))}.`;
        break;
      }
      case "card_urgente_adicionado":
        detalhe = payload.bloqueado
          ? "Card intempestivo adicionado à programação do dia — UH marcada para bloqueio."
          : "Card intempestivo adicionado à programação do dia.";
        break;
      case "material_comprado":
        detalhe = "Material marcado como comprado.";
        break;
      case "cotacao_registrada":
        detalhe = `Cotação registrada com ${String(payload.fornecedorNome ?? "fornecedor")}.`;
        break;
      case "servico_agendado":
        detalhe = `Serviço agendado com ${String(payload.fornecedorNome ?? "fornecedor")} para ${String(payload.data ?? "—")}.`;
        break;
      case "spot_editado":
        detalhe = typeof payload.comment === "string" && payload.comment ? payload.comment : "Descrição/fotos da não conformidade atualizadas.";
        break;
      case "uh3d_imagem":
        detalhe = payload.acao === "excluída"
          ? `Foto do cômodo "${String(payload.tipo ?? "—")}" excluída.`
          : `Nova foto adicionada ao cômodo "${String(payload.tipo ?? "—")}".`;
        break;
      case "uh3d_spot":
        detalhe = payload.acao === "excluído"
          ? "Spot removido da UH 3D."
          : payload.acao === "movido"
            ? "Spot reposicionado na UH 3D."
            : "Novo spot adicionado na UH 3D.";
        break;
      case "item_catalogo_editado":
        uhNumero = "—";
        detalhe = payload.acao === "criado"
          ? `Item "${String(payload.itemNome ?? "—")}" criado no catálogo.`
          : payload.acao === "excluído"
            ? `Item "${String(payload.itemNome ?? "—")}" excluído do catálogo.`
            : `Item "${String(payload.itemNome ?? "—")}" editado no catálogo.`;
        break;
      case "atribuicao_editada": {
        if (payload.acao === "item_removido") {
          detalhe = `Item "${String(payload.itemRemovidoNome ?? "—")}" removido como incompatível.`;
        } else {
          const nomes = Array.isArray(payload.itemNomes) ? (payload.itemNomes as string[]) : [];
          const total = typeof payload.totalItens === "number" ? payload.totalItens : nomes.length;
          detalhe = `Atribuição de itens atualizada — ${total} ${total === 1 ? "item aplicável" : "itens aplicáveis"}${nomes.length ? `: ${limitarLista(nomes)}` : ""}.`;
        }
        break;
      }
      case "config_editada":
        uhNumero = "—";
        detalhe = `Prazo entre inspeções: ${String(payload.maxDaysBetweenInspectionsAntes ?? "—")} → ${String(payload.maxDaysBetweenInspectionsDepois ?? "—")} dias · Meta: ${String(payload.goalAntes ?? "—")}% → ${String(payload.goalDepois ?? "—")}%.`;
        break;
    }

    logEventos.push({
      id: `ai-${ev.id}`,
      tipo,
      timestamp: ev.createdAt.toISOString(),
      uhNumero,
      itemNome,
      atorNome,
      detalhe,
      urgente: false,
    });
  }

  logEventos.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

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
      cardsExecutadasHoje={cardsExecutadasHojeView}
      suppliers={suppliersView}
      uhIdsSelecionadasHoje={uhsSelecionadasHoje.map((u) => u.uhId)}
      uhIdsComReservaHoje={uhsSelecionadasHoje.filter((u) => u.temReserva).map((u) => u.uhId)}
      uhIdsLiberadasHoje={uhsSelecionadasHoje.filter((u) => u.liberada).map((u) => u.uhId)}
      commitments={commitmentsView}
      hojeSP={hoje}
      conformitySnapshots={conformitySnapshotsView}
      logEventos={logEventos}
      ncSurgidasEm={ncSurgidasBrutas.map((c) => c.createdAt.toISOString())}
      ncEliminadasEm={ncEliminadasBrutas.map((c) => c.createdAt.toISOString())}
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
