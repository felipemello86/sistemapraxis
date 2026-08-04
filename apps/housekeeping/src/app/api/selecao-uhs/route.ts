import { NextRequest, NextResponse } from "next/server";
import {
  ativarManutencaoUH,
  cancelarCardsPorExclusaoDeUh,
  emitEvent,
  getSession,
  hasModuleAccess,
  prisma,
  sendPushToUser,
} from "@praxis/core";
import { notificarQueixa } from "@/lib/telegram";
import { liberarLateCheckoutsVencidos } from "@/lib/late-checkout";
import { liberarSelecionadasAoMeioDia } from "@/lib/liberacao-automatica";
import { dataAtualSP } from "@/lib/timezone";

// Igual ao addBusinessDays de apps/booking-reviews/src/lib/scoring.ts —
// duplicado aqui (não é exportado por @praxis/core) só pra calcular o prazo
// de análise (2 dias úteis) do card espelho criado por "registrar_queixa".
function addBusinessDays(start: Date, days: number) {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

// Portado de apps/housekeeping/src/app/api/selecao-uhs/route.ts (v1).
// Mesma lógica de seleção/liberação diária de UHs. Diferenças conscientes
// desta fatia:
//   - Notificações Telegram viraram `// TODO:` (lib/telegram + lib/destinatarios
//     ainda não existem em v2 — ver escopo deferido).
//   - O auto-trigger de relatório PDF + ranking do dia (disparado no fim de
//     "renovar" quando todas as UHs terminam) foi removido por enquanto —
//     depende de react-pdf/relatorio-dados, que são uma fatia própria futura.
//   - Bridge de token pra camareira via Telegram (signAccessToken) foi
//     removido — camareira agora só acessa via sessão/login (decisão
//     explícita do Felipe, ver conversa sobre mudança de fluxo).
//   - hotelId → tenantId (schema único v2).

export const runtime = "nodejs";
export const maxDuration = 60;

// ATENDIMENTO tem as mesmas permissões de GERENTE em todo o módulo
// Governança, exceto em Configurações (decisão explícita do Felipe) — ver
// mesmo comentário em atribuicoes/route.ts, relatorio-diario/route.ts e
// dashboard/BurndownChart.tsx.
function onlyManagerOrMaster(role: string) {
  return ["MASTER", "GERENTE", "ATENDIMENTO"].includes(role);
}

// GET /api/selecao-uhs?data=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Leitura sempre liberada, mesmo sem acesso ao módulo (ver comentário em
  // apps/maintenance/src/app/page.tsx) — POST/PATCH abaixo continuam gateados.
  const tenantId = session.tenantId;

  const data = req.nextUrl.searchParams.get("data") || dataAtualSP();

  // Best-effort: se alguma UH marcada como Late Check-out já passou da hora
  // de saída, libera sozinha antes de montar a resposta. Nunca deve travar
  // a tela por causa disso.
  try {
    await liberarLateCheckoutsVencidos(tenantId);
  } catch (e) {
    console.error("[late-checkout] falha ao liberar automaticamente:", e);
  }

  // Idem pra liberação automática ao meio-dia (ver lib/liberacao-automatica.ts)
  // — mesmo padrão de melhor esforço, além do cron dedicado, pra funcionar
  // mesmo se alguém abrir a tela antes do cron rodar.
  try {
    await liberarSelecionadasAoMeioDia(tenantId);
  } catch (e) {
    console.error("[liberacao-automatica] falha ao liberar automaticamente:", e);
  }

  const [status, selecoes, assignments, queixas, catalogoManutencao, atribuicoesManutencao] = await Promise.all([
    prisma.dailySelectionStatus.findUnique({ where: { tenantId_data: { tenantId, data } } }),
    prisma.dailyUHSelection.findMany({
      where: { tenantId, data },
      include: {
        uh: {
          select: {
            id: true,
            numero: true,
            emManutencao: true,
            manutencaoDescricao: true,
            bloqueada: true,
            bloqueioDescricao: true,
          },
        },
      },
      relationLoadStrategy: "join",
    }),
    prisma.dailyAssignment.findMany({
      where: { tenantId, data },
      include: { camareira: { select: { id: true, nome: true, telegramChatId: true } } },
      relationLoadStrategy: "join",
    }),
    prisma.guestComplaint.findMany({
      where: { tenantId, data },
      select: { id: true, uhId: true, titulo: true, tipo: true, descricao: true, pontosDescontados: true, anexos: true, createdAt: true },
    }),
    // Catálogo + atribuições por UH do módulo de Manutenção — alimenta o
    // seletor de item obrigatório no modal de "Solicitar manutenção" (pedido
    // explícito do Felipe: todo defeito precisa ser associado a um item real
    // do cadastro, não mais um texto solto). Mesma lógica de
    // itensParaUnidade em apps/maintenance/src/lib/domain.ts: sem linha de
    // atribuição pra uma UH = todos os itens do catálogo se aplicam a ela.
    prisma.maintenanceChecklistItem.findMany({
      where: { tenantId },
      select: { id: true, name: true, category: true },
      orderBy: { name: "asc" },
    }),
    prisma.maintenanceUnitChecklistItem.findMany({
      where: { tenantId },
      select: { uhId: true, checklistItemId: true },
    }),
  ]);

  const atribuicoesPorUh = new Map<string, string[]>();
  for (const a of atribuicoesManutencao) {
    atribuicoesPorUh.set(a.uhId, [...(atribuicoesPorUh.get(a.uhId) ?? []), a.checklistItemId]);
  }

  const assignmentByUH = Object.fromEntries(assignments.map((a) => [a.uhId, a]));
  const queixasByUH = new Map<string, typeof queixas>();
  for (const q of queixas) {
    queixasByUH.set(q.uhId, [...(queixasByUH.get(q.uhId) ?? []), q]);
  }

  return NextResponse.json({
    confirmado: status?.confirmado ?? false,
    uhs: selecoes.map((s) => {
      const a = assignmentByUH[s.uhId];
      // Reconcilia status "fantasma": DailyUHSelection.liberada e
      // DailyAssignment.status são gravados por caminhos separados (ex.: a
      // liberação automática do meio-dia atualiza a atribuição só se ela já
      // existia no exato instante em que rodou — se a atribuição surgir bem
      // nesse meio-tempo, fica com liberada=true mas status ainda PENDENTE,
      // um "cadeado aberto" com texto "Aguardando"). Mesmo patch que
      // /api/atribuicoes GET já faz — sem isso a tela mostra um estado
      // impossível pra quem está vendo.
      const assignmentStatus = a && a.status === "PENDENTE" && s.liberada ? "LIBERADO" : (a?.status ?? null);
      return {
        uhId: s.uhId,
        numero: s.uh.numero,
        liberada: s.liberada,
        liberadaEm: s.liberadaEm,
        temReserva: s.temReserva,
        emManutencao: s.uh.emManutencao,
        manutencaoDescricao: s.uh.manutencaoDescricao ?? null,
        bloqueada: s.uh.bloqueada,
        bloqueioDescricao: s.uh.bloqueioDescricao ?? null,
        assignmentId: a?.id ?? null,
        camareiraId: a?.camareiraId ?? null,
        camareiraNome: a?.camareira.nome ?? null,
        assignmentStatus,
        observacoes: a?.observacoes ?? null,
        comentario: s.comentario ?? null,
        comentarioPorNome: s.comentarioPorNome ?? null,
        comentarioEm: s.comentarioEm ?? null,
        prioridade: s.prioridade,
        prioridadeDescricao: s.prioridadeDescricao ?? null,
        prioridadePorNome: s.prioridadePorNome ?? null,
        prioridadeEm: s.prioridadeEm ?? null,
        lateCheckout: s.lateCheckout,
        lateCheckoutHora: s.lateCheckoutHora ?? null,
        lateCheckoutPorNome: s.lateCheckoutPorNome ?? null,
        queixas: (queixasByUH.get(s.uhId) ?? []).map((q) => ({
          id: q.id,
          titulo: q.titulo,
          tipo: q.tipo,
          descricao: q.descricao,
          pontosDescontados: q.pontosDescontados,
          anexos: (() => { try { return JSON.parse(q.anexos); } catch { return []; } })(),
          createdAt: q.createdAt,
        })),
        // Itens de checklist de Manutenção aplicáveis a essa UH — sem linha
        // de atribuição customizada = catálogo inteiro se aplica (mesma
        // regra de itensParaUnidade em apps/maintenance/src/lib/domain.ts).
        // Alimenta o seletor obrigatório do modal "Solicitar manutenção".
        itensManutencao: (() => {
          const permitidos = atribuicoesPorUh.get(s.uhId);
          if (!permitidos || permitidos.length === 0) return catalogoManutencao;
          const permitidosSet = new Set(permitidos);
          return catalogoManutencao.filter((it) => permitidosSet.has(it.id));
        })(),
      };
    }),
  });
}

// POST /api/selecao-uhs — salva seleção (modo edição)
// Body: { data, uhIds: string[] }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  if (!onlyManagerOrMaster(session.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const tenantId = session.tenantId;

  const { data, uhIds } = await req.json();
  if (!data) return NextResponse.json({ error: "data obrigatória" }, { status: 400 });

  const existentes = await prisma.dailyUHSelection.findMany({ where: { tenantId, data } });

  const idsAntigos = new Set(existentes.map((e) => e.uhId));
  const idsNovos = new Set((uhIds ?? []) as string[]);
  const removidasIds = [...idsAntigos].filter((id) => !idsNovos.has(id));
  const adicionadasIds = [...idsNovos].filter((id) => !idsAntigos.has(id));
  // TODO: notificar governanta/suporte via Telegram sobre UHs adicionadas/removidas em edição

  // Só mexe no que de fato mudou (adiciona as novas, remove as tiradas da
  // lista) — NUNCA apaga/recria as UHs que já estavam e continuam
  // selecionadas. Antes disso era delete+recreate de TODAS as linhas do dia
  // a cada "Salvar", mesmo quando só uma UH era adicionada/removida — e o
  // createMany só levava adiante liberada/liberadaEm/temReserva
  // explicitamente, então comentario/prioridade/lateCheckout das UHs
  // inalteradas eram apagados silenciosamente toda vez, e temReserva
  // especificamente virava uma corrida: se alguém marcasse/desmarcasse a
  // reserva de uma UH (PATCH toggle_reserva) entre o momento em que este
  // POST leu `existentes` (linha acima) e o commit do delete+recreate, essa
  // mudança concorrente era perdida — bug real reportado: "flag de reserva
  // sendo desabilitada sozinha" (e podia acontecer nos dois sentidos).
  if (removidasIds.length > 0) {
    await prisma.dailyAssignment.deleteMany({
      where: { tenantId, data, uhId: { in: removidasIds } },
    });
    await prisma.dailyUHSelection.deleteMany({
      where: { tenantId, data, uhId: { in: removidasIds } },
    });
  }

  if (adicionadasIds.length > 0) {
    await prisma.dailyUHSelection.createMany({
      data: adicionadasIds.map((uhId) => ({ tenantId, data, uhId })),
    });
  }

  await prisma.dailySelectionStatus.upsert({
    where: { tenantId_data: { tenantId, data } },
    update: { confirmado: false },
    create: { tenantId, data, confirmado: false },
  });

  // Log do Sistema — só emite quando algo de fato mudou (evita ruído em
  // "Salvar" sem alterações reais na lista do dia).
  if (removidasIds.length > 0 || adicionadasIds.length > 0) {
    const uhsEnvolvidas = await prisma.uH.findMany({
      where: { id: { in: [...removidasIds, ...adicionadasIds] } },
      select: { id: true, numero: true },
    });
    const numeroPorId = new Map(uhsEnvolvidas.map((u) => [u.id, u.numero]));
    await emitEvent({
      tenantId,
      module: "HOUSEKEEPING",
      eventType: "housekeeping.log.selecao_dia_editada",
      entityType: "DailyUHSelection",
      entityId: data,
      payload: {
        data,
        atorNome: session.nome,
        adicionadas: adicionadasIds.map((id) => numeroPorId.get(id) ?? id),
        removidas: removidasIds.map((id) => numeroPorId.get(id) ?? id),
      },
    });
  }

  return NextResponse.json({ ok: true });
}

// PATCH /api/selecao-uhs — ações: confirmar, liberar, desfazer_liberacao, toggle_manutencao,
// desbloquear, toggle_reserva, renovar, set_observacao, reeditar, set_comentario,
// set_prioridade, remover_prioridade
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  const role = session.role;
  const isGerente = onlyManagerOrMaster(role);
  const isGovernanta = role === "GOVERNANTA";
  if (!isGerente && !isGovernanta) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const tenantId = session.tenantId;

  const { action, data, uhId, assignmentId, descricao, observacoes, comentario, tipo, anexos, titulo, horaSaida, checklistItemId, urgente, prioridade, justificativa } = await req.json();

  const acoesGovernanta = [
    "toggle_manutencao", "toggle_reserva", "liberar", "desfazer_liberacao", "desbloquear",
    // Duas ações novas (pedido do Felipe, 04/08/2026): "liberar UH pra
    // check-in sem inspeção" e "registrar limpeza sem a camareira ter
    // registrado" — Governanta/Gerente/Atendimento/Master, mesmo grupo de
    // "desbloquear" acima.
    "liberar_sem_inspecao", "limpeza_sem_registro",
  ];
  if (!isGerente && !acoesGovernanta.includes(action)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // ── Confirmar seleção do dia ──────────────────────────────────────
  if (action === "confirmar") {
    await prisma.dailySelectionStatus.upsert({
      where: { tenantId_data: { tenantId, data } },
      update: { confirmado: true },
      create: { tenantId, data, confirmado: true },
    });
    await emitEvent({
      tenantId,
      module: "HOUSEKEEPING",
      eventType: "housekeeping.log.selecao_dia_confirmada",
      entityType: "DailySelectionStatus",
      entityId: data,
      payload: { data, atorNome: session.nome },
    });
    // TODO: notificar suporte via Telegram sobre confirmação da seleção
    return NextResponse.json({ ok: true });
  }

  // ── Liberar UH individual ─────────────────────────────────────────
  if (action === "liberar") {
    await prisma.dailyUHSelection.update({
      where: { data_uhId: { data, uhId } },
      data: { liberada: true, liberadaEm: new Date(), liberadoPorNome: session.nome },
    });

    if (assignmentId) {
      const assignment = await prisma.dailyAssignment.update({
        where: { id: assignmentId },
        data: { status: "LIBERADO", liberadaEm: new Date() },
        include: { uh: { select: { numero: true } } },
      });
      // Push (best-effort, mas com await — ver comentário em sendPushToUser
      // sobre por que "fire and forget" perde a notificação em serverless).
      // Telegram continua TODO.
      await sendPushToUser(assignment.camareiraId, {
        title: "UH liberada",
        body: `A UH ${assignment.uh.numero} foi liberada pra limpeza.`,
        data: { tipo: "liberacao", uhId, data },
      });
      // TODO: notificar suporte via Telegram
    }

    return NextResponse.json({ ok: true });
  }

  // ── Desfazer liberação ────────────────────────────────────────────
  if (action === "desfazer_liberacao") {
    if (assignmentId) {
      const assignment = await prisma.dailyAssignment.findUnique({
        where: { id: assignmentId },
        include: { uh: true, camareira: true },
      });
      if (!assignment) return NextResponse.json({ error: "Atribuição não encontrada" }, { status: 404 });
      if (assignment.status !== "LIBERADO") {
        return NextResponse.json({ error: "Não é possível desfazer: limpeza já iniciada" }, { status: 409 });
      }

      await prisma.dailyAssignment.update({
        where: { id: assignmentId },
        data: { status: "PENDENTE", liberadaEm: null },
      });

      await prisma.dailyUHSelection.update({
        where: { data_uhId: { data, uhId } },
        data: { liberada: false, liberadaEm: null },
      });

      await sendPushToUser(assignment.camareiraId, {
        title: "Liberação desfeita",
        body: `A liberação da UH ${assignment.uh.numero} foi desfeita.`,
        data: { tipo: "liberacao_desfeita", uhId: assignment.uhId, data },
      });
      const destinatariosDesfazer = await prisma.user.findMany({
        where: { tenantId, ativo: true, role: { in: ["GOVERNANTA", "GERENTE", "MASTER"] } },
        select: { id: true },
      });
      for (const d of destinatariosDesfazer) {
        await sendPushToUser(d.id, {
          title: "Liberação desfeita",
          body: `UH ${assignment.uh.numero} teve a liberação desfeita.`,
          data: { tipo: "liberacao_desfeita", uhId: assignment.uhId, data },
        });
      }
      // TODO: notificar camareira, governantas e gerente via Telegram

      await emitEvent({
        tenantId,
        module: "HOUSEKEEPING",
        eventType: "housekeeping.log.liberacao_desfeita",
        entityType: "DailyAssignment",
        entityId: assignmentId,
        payload: { uhNumero: assignment.uh.numero, camareiraNome: assignment.camareira.nome, atorNome: session.nome },
      });

      return NextResponse.json({ ok: true });
    }

    await prisma.dailyUHSelection.update({
      where: { data_uhId: { data, uhId } },
      data: { liberada: false, liberadaEm: null },
    });
    const uhDesfazerSemAssignment = await prisma.uH.findUnique({ where: { id: uhId }, select: { numero: true } });
    await emitEvent({
      tenantId,
      module: "HOUSEKEEPING",
      eventType: "housekeeping.log.liberacao_desfeita",
      entityType: "DailyUHSelection",
      entityId: `${data}:${uhId}`,
      payload: { uhNumero: uhDesfazerSemAssignment?.numero ?? null, atorNome: session.nome },
    });
    return NextResponse.json({ ok: true });
  }

  // ── Toggle manutenção ─────────────────────────────────────────────
  // Pedido explícito do Felipe (revertendo uma decisão anterior): "o
  // registro de manutenção pela tela seleção e liberação não deve exigir
  // aprovação. Normalmente é o atendimento que registra, então já deve
  // transformar o item para não-conforme." LIGAR chama ativarManutencaoUH
  // direto — sem pendência, sem passar pela tela de Decisão de Bloqueio. O
  // item real do checklist vira NAO_CONFORME na hora e o card de Correção já
  // nasce em "A Processar" (só falta triar aquisição/serviço externo). Isso
  // é diferente do fluxo de NC urgente/bloqueio (aplicarBloqueioPorUrgencia,
  // mesmo arquivo core), que CONTINUA exigindo decisão do Atendimento — essa
  // mudança foi só pro tipo Manutenção. DESLIGAR continua imediato, como
  // sempre foi — não é uma decisão que precise de aprovação, só limpa os 4
  // campos.
  if (action === "toggle_manutencao") {
    const uh = await prisma.uH.findUnique({
      where: { id: uhId },
      select: { numero: true, emManutencao: true, manutencaoDescricao: true },
    });
    if (!uh) return NextResponse.json({ error: "UH não encontrada" }, { status: 404 });

    if (uh.emManutencao) {
      await prisma.uH.update({
        where: { id: uhId },
        data: {
          emManutencao: false,
          manutencaoDescricao: null,
          manutencaoSolicitanteNome: null,
          manutencaoEm: null,
        },
      });
      await emitEvent({
        tenantId,
        module: "HOUSEKEEPING",
        eventType: "housekeeping.log.manutencao_toggle",
        entityType: "UH",
        entityId: uhId,
        payload: { uhNumero: uh.numero, acao: "encerrada", descricaoAnterior: uh.manutencaoDescricao, atorNome: session.nome },
      });
      return NextResponse.json({ emManutencao: false });
    }

    // Descrição obrigatória pra pedir a manutenção — a UI já bloqueia o
    // botão "Confirmar" sem texto (ver manutencaoModal em SelecaoView.tsx),
    // mas reforça aqui também.
    if (!descricao?.trim()) {
      return NextResponse.json({ error: "Descrição obrigatória para solicitar manutenção." }, { status: 400 });
    }
    // Urgência e prioridade — pedido explícito do Felipe (04/08/2026): esse
    // atalho passou a perguntar as duas flags também, igual aos outros
    // pontos de entrada de NC (antes o item nascia sempre urgente=false/
    // prioridade=false por padrão do schema, sem perguntar nada).
    if (typeof urgente !== "boolean") {
      return NextResponse.json(
        { error: "Informe se essa não conformidade é impeditiva ao uso (urgente)." },
        { status: 400 },
      );
    }
    if (typeof prioridade !== "boolean") {
      return NextResponse.json(
        { error: "Informe se essa não conformidade é um defeito prioritário." },
        { status: 400 },
      );
    }

    // Item de checklist obrigatório (pedido explícito do Felipe: "todo
    // defeito de manutenção aberto na tela de seleção e liberação deve ser
    // associado a algum item real daquela UH presente no cadastro do módulo
    // de manutenção"). Revalida no servidor que o item pertence ao catálogo
    // aplicável a essa UH — não confia só no que a UI mandou.
    if (!checklistItemId) {
      return NextResponse.json({ error: "Selecione o item de checklist com defeito." }, { status: 400 });
    }
    const [itemCatalogo, atribuicoesDaUh] = await Promise.all([
      prisma.maintenanceChecklistItem.findUnique({
        where: { id: checklistItemId },
        select: { id: true, tenantId: true, name: true },
      }),
      prisma.maintenanceUnitChecklistItem.findMany({
        where: { tenantId, uhId },
        select: { checklistItemId: true },
      }),
    ]);
    if (!itemCatalogo || itemCatalogo.tenantId !== tenantId) {
      return NextResponse.json({ error: "Item de checklist inválido." }, { status: 400 });
    }
    // Sem linha de atribuição pra essa UH = catálogo inteiro se aplica (ver
    // comentário em itensParaUnidade / GET acima) — só rejeita quando existe
    // uma lista customizada e o item escolhido não está nela.
    if (atribuicoesDaUh.length > 0 && !atribuicoesDaUh.some((a) => a.checklistItemId === checklistItemId)) {
      return NextResponse.json({ error: "Esse item não se aplica a essa UH." }, { status: 400 });
    }

    await ativarManutencaoUH({
      tenantId,
      uhId,
      checklistItemId,
      descricao: descricao.trim(),
      solicitanteNome: session.nome,
      registradoPorId: session.userId,
      urgente,
      prioridade,
    });

    await emitEvent({
      tenantId,
      module: "HOUSEKEEPING",
      eventType: "housekeeping.log.manutencao_toggle",
      entityType: "UH",
      entityId: uhId,
      payload: {
        uhNumero: uh.numero,
        acao: "solicitada",
        descricao: descricao.trim(),
        itemNome: itemCatalogo.name,
        atorNome: session.nome,
        urgente,
        prioridade,
      },
    });

    return NextResponse.json({ emManutencao: true });
  }

  // ── Desbloquear UH manualmente ────────────────────────────────────
  // Restrito a MASTER/GERENTE/ATENDIMENTO/GOVERNANTA (pedido explícito do
  // Felipe) — libera a UH pra reservas independente da origem do bloqueio
  // (manual, ver api/bloqueio/route.ts, ou DECISAO_ATENDIMENTO, ver
  // packages/core/src/maintenanceUrgente.ts e
  // api/decisao-bloqueio/route.ts). O sistema não desbloqueia mais sozinho
  // em nenhum caso — toda liberação de bloqueio passa por aqui, decisão
  // humana explícita.
  if (action === "desbloquear") {
    const uh = await prisma.uH.findUnique({ where: { id: uhId }, select: { numero: true, bloqueada: true } });
    if (!uh) return NextResponse.json({ error: "UH não encontrada" }, { status: 404 });
    if (!uh.bloqueada) return NextResponse.json({ ok: true });

    await prisma.uH.update({
      where: { id: uhId },
      data: {
        bloqueada: false,
        bloqueioDescricao: null,
        bloqueioSolicitanteNome: null,
        bloqueioEm: null,
        bloqueioOrigem: null,
      },
    });

    const destinatariosDesbloqueio = await prisma.user.findMany({
      where: { tenantId, ativo: true, role: { in: ["GOVERNANTA", "GERENTE", "MASTER", "ATENDIMENTO"] } },
      select: { id: true },
    });
    for (const d of destinatariosDesbloqueio) {
      await sendPushToUser(d.id, {
        title: "🔓 UH desbloqueada",
        body: `UH ${uh.numero} foi desbloqueada por ${session.nome}.`,
        data: { tipo: "desbloqueio", uhId, data },
      });
    }

    await emitEvent({
      tenantId,
      module: "HOUSEKEEPING",
      eventType: "housekeeping.log.uh_desbloqueada",
      entityType: "UH",
      entityId: uhId,
      payload: { uhNumero: uh.numero, atorNome: session.nome },
    });

    return NextResponse.json({ ok: true });
  }

  // ── Liberar sem inspeção ──────────────────────────────────────────
  // Pedido do Felipe (04/08/2026): Governanta/Gerente/Atendimento/Master
  // podem liberar a UH direto pro check-in pulando a etapa de inspeção
  // (ex.: UH ociosa há muito tempo, urgência operacional). Replica a MESMA
  // transição de estado que o "finalizar" de InspectionSession faz em
  // inspecoes/route.ts (DailyAssignment → INSPECIONADO + UH → PRONTO), só
  // que sem criar/fechar uma InspectionSession de verdade. Justificativa é
  // obrigatória e vai pro Log do Sistema.
  if (action === "liberar_sem_inspecao") {
    if (!justificativa || !justificativa.trim()) {
      return NextResponse.json({ error: "Justificativa é obrigatória" }, { status: 400 });
    }

    const uh = await prisma.uH.findUnique({ where: { id: uhId }, select: { numero: true } });
    if (!uh) return NextResponse.json({ error: "UH não encontrada" }, { status: 404 });

    await prisma.uH.update({ where: { id: uhId }, data: { status: "PRONTO" } });

    if (assignmentId) {
      await prisma.dailyAssignment.update({
        where: { id: assignmentId },
        data: { status: "INSPECIONADO" },
      });

      // Se já existe uma CleaningSession pra essa atribuição (a camareira já
      // limpou e a UH apareceu em "Aguardando inspeção" na tela Inspeções),
      // precisa criar/finalizar a InspectionSession também — senão a UH
      // continua presa em "Aguardando inspeção" lá, já que aquela tela decide
      // pendente vs. concluída pelo campo inspection.finalizadaEm, não pelo
      // status da DailyAssignment. Marca liberadaSemInspecao=true pra
      // aparecer numa seção própria em vez de junto das inspeções de verdade
      // (nenhum InspectionItem é avaliado aqui).
      const cleaningSession = await prisma.cleaningSession.findUnique({
        where: { assignmentId },
        select: { id: true, inspection: { select: { id: true, finalizadaEm: true } } },
      });
      if (cleaningSession) {
        if (cleaningSession.inspection) {
          await prisma.inspectionSession.update({
            where: { id: cleaningSession.inspection.id },
            data: {
              finalizadaEm: cleaningSession.inspection.finalizadaEm ?? new Date(),
              liberadaSemInspecao: true,
              justificativaLiberacao: justificativa.trim(),
            },
          });
        } else {
          await prisma.inspectionSession.create({
            data: {
              sessionId: cleaningSession.id,
              uhId,
              governantaId: session.userId,
              iniciadaEm: new Date(),
              finalizadaEm: new Date(),
              liberadaSemInspecao: true,
              justificativaLiberacao: justificativa.trim(),
            },
          });
        }
      }
    }

    await emitEvent({
      tenantId,
      module: "HOUSEKEEPING",
      eventType: "housekeeping.log.liberado_sem_inspecao",
      entityType: "UH",
      entityId: uhId,
      payload: { uhNumero: uh.numero, atorNome: session.nome, justificativa: justificativa.trim() },
    });

    return NextResponse.json({ ok: true });
  }

  // ── Limpeza sem registro ──────────────────────────────────────────
  // Pedido do Felipe (04/08/2026): cobre o caso em que a camareira limpou
  // a UH de fato mas não registrou no app (celular descarregou, esqueceu
  // etc.) — Governanta/Gerente/Atendimento/Master registram a limpeza em
  // nome dela. NÃO pula a inspeção (diferente da ação acima): UH vai pra
  // AGUARDANDO_INSPECAO, não PRONTO. A CleaningSession criada tem duração
  // zerada, então é marcada excluidoDoScore=true pra não gerar bônus
  // indevido no cálculo de score (ver calcularScoreVelocidade em
  // lib/scoring.ts — sessão com iniciadaEm===finalizadaEm e não excluída
  // geraria pontuação artificial).
  if (action === "limpeza_sem_registro") {
    if (!justificativa || !justificativa.trim()) {
      return NextResponse.json({ error: "Justificativa é obrigatória" }, { status: 400 });
    }
    if (!assignmentId) {
      return NextResponse.json({ error: "assignmentId é obrigatório" }, { status: 400 });
    }

    const assignment = await prisma.dailyAssignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, uhId: true, camareiraId: true, status: true },
    });
    if (!assignment) return NextResponse.json({ error: "Atribuição não encontrada" }, { status: 404 });

    const uh = await prisma.uH.findUnique({ where: { id: assignment.uhId }, select: { numero: true } });

    const agora = new Date();

    await prisma.cleaningSession.upsert({
      where: { assignmentId: assignment.id },
      create: {
        assignmentId: assignment.id,
        uhId: assignment.uhId,
        camareiraId: assignment.camareiraId,
        iniciadaEm: agora,
        finalizadaEm: agora,
        duracaoSegundos: 0,
        excluidoDoScore: true,
        justificativaExclusao: justificativa.trim(),
      },
      update: {
        finalizadaEm: agora,
        duracaoSegundos: 0,
        excluidoDoScore: true,
        justificativaExclusao: justificativa.trim(),
      },
    });

    await prisma.dailyAssignment.update({
      where: { id: assignment.id },
      data: { status: "CONCLUIDO" },
    });
    await prisma.uH.update({ where: { id: assignment.uhId }, data: { status: "AGUARDANDO_INSPECAO" } });

    await emitEvent({
      tenantId,
      module: "HOUSEKEEPING",
      eventType: "housekeeping.log.limpeza_sem_registro",
      entityType: "UH",
      entityId: assignment.uhId,
      payload: { uhNumero: uh?.numero, atorNome: session.nome, justificativa: justificativa.trim() },
    });

    return NextResponse.json({ ok: true });
  }

  // ── Toggle reserva ────────────────────────────────────────────────
  if (action === "toggle_reserva") {
    const atual = await prisma.dailyUHSelection.findUnique({
      where: { data_uhId: { data, uhId } },
      select: { temReserva: true },
    });
    const novoValor = !(atual?.temReserva ?? false);
    await prisma.dailyUHSelection.update({
      where: { data_uhId: { data, uhId } },
      data: { temReserva: novoValor },
    });
    const uhReserva = await prisma.uH.findUnique({ where: { id: uhId }, select: { numero: true } });
    await emitEvent({
      tenantId,
      module: "HOUSEKEEPING",
      eventType: "housekeeping.log.reserva_alterada",
      entityType: "DailyUHSelection",
      entityId: `${data}:${uhId}`,
      payload: { uhNumero: uhReserva?.numero ?? null, temReserva: novoValor, atorNome: session.nome },
    });
    return NextResponse.json({ temReserva: novoValor });
  }

  // ── Ativar Late Check-out ─────────────────────────────────────────
  // Restrito a MASTER/GERENTE/ATENDIMENTO (mesma decisão de set_comentario e
  // registrar_queixa) — a UH não vai ser liberada no fluxo normal, então
  // exige hora de saída obrigatória ("HH:mm"). A liberação automática de
  // verdade acontece em lib/late-checkout.ts.
  if (action === "ativar_late_checkout") {
    if (!isGerente) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    const hora = horaSaida?.trim();
    if (!hora || !/^\d{2}:\d{2}$/.test(hora)) {
      return NextResponse.json({ error: "horaSaida obrigatória (HH:mm)" }, { status: 400 });
    }
    await prisma.dailyUHSelection.update({
      where: { data_uhId: { data, uhId } },
      data: {
        lateCheckout: true,
        lateCheckoutHora: hora,
        lateCheckoutPorNome: session.nome,
        lateCheckoutEm: new Date(),
      },
    });
    const uhLateOn = await prisma.uH.findUnique({ where: { id: uhId }, select: { numero: true } });
    await emitEvent({
      tenantId,
      module: "HOUSEKEEPING",
      eventType: "housekeeping.log.late_checkout_alterado",
      entityType: "DailyUHSelection",
      entityId: `${data}:${uhId}`,
      payload: { uhNumero: uhLateOn?.numero ?? null, acao: "ativado", horaSaida: hora, atorNome: session.nome },
    });
    return NextResponse.json({ ok: true });
  }

  // ── Desativar Late Check-out ──────────────────────────────────────
  if (action === "desativar_late_checkout") {
    if (!isGerente) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    await prisma.dailyUHSelection.update({
      where: { data_uhId: { data, uhId } },
      data: {
        lateCheckout: false,
        lateCheckoutHora: null,
        lateCheckoutPorNome: null,
        lateCheckoutEm: null,
      },
    });
    const uhLateOff = await prisma.uH.findUnique({ where: { id: uhId }, select: { numero: true } });
    await emitEvent({
      tenantId,
      module: "HOUSEKEEPING",
      eventType: "housekeeping.log.late_checkout_alterado",
      entityType: "DailyUHSelection",
      entityId: `${data}:${uhId}`,
      payload: { uhNumero: uhLateOff?.numero ?? null, acao: "desativado", atorNome: session.nome },
    });
    return NextResponse.json({ ok: true });
  }

  // ── Renovação — remove assignment + selection do dia ─────────────
  if (action === "renovar") {
    if (!isGerente) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    const uhRenovar = await prisma.uH.findUnique({ where: { id: uhId }, select: { numero: true } });

    if (assignmentId) {
      const assignment = await prisma.dailyAssignment.findUnique({
        where: { id: assignmentId },
        include: {
          cleaningSession: { include: { inspection: true } },
          camareira: { select: { nome: true } },
        },
      });
      if (!assignment) return NextResponse.json({ error: "Atribuição não encontrada" }, { status: 404 });

      // Log emitido ANTES dos deletes abaixo, de propósito — mesmo padrão
      // usado em reabrirProgramacaoDiaImpl (Manutenção): depois do cascade
      // este é o único rastro que sobra de que a UH foi renovada e o que
      // tinha sido feito até então.
      await emitEvent({
        tenantId,
        module: "HOUSEKEEPING",
        eventType: "housekeeping.log.atribuicao_renovada",
        entityType: "DailyAssignment",
        entityId: assignmentId,
        payload: {
          uhNumero: uhRenovar?.numero ?? null,
          camareiraNome: assignment.camareira.nome,
          tinhaSessaoLimpeza: !!assignment.cleaningSession,
          tinhaInspecao: !!assignment.cleaningSession?.inspection,
          atorNome: session.nome,
        },
      });

      // Cascade manual: InspectionItems → InspectionSession → SessionSteps → CleaningSession → Assignment
      if (assignment.cleaningSession) {
        const sessionId = assignment.cleaningSession.id;
        if (assignment.cleaningSession.inspection) {
          await prisma.inspectionItem.deleteMany({ where: { inspectionId: assignment.cleaningSession.inspection.id } });
          await prisma.inspectionSession.delete({ where: { sessionId } });
        }
        await prisma.sessionStep.deleteMany({ where: { sessionId } });
        await prisma.cleaningSession.delete({ where: { id: sessionId } });
      }

      await prisma.dailyAssignment.delete({ where: { id: assignmentId } });
    } else {
      await emitEvent({
        tenantId,
        module: "HOUSEKEEPING",
        eventType: "housekeeping.log.atribuicao_renovada",
        entityType: "DailyUHSelection",
        entityId: `${data}:${uhId}`,
        payload: { uhNumero: uhRenovar?.numero ?? null, camareiraNome: null, atorNome: session.nome },
      });
    }

    await prisma.dailyUHSelection.delete({ where: { data_uhId: { data, uhId } } });

    // Repercute a exclusão no módulo de Manutenção (pedido explícito do
    // Felipe, 01/08/2026): cancela (não apaga) qualquer card de NC em aberto
    // dessa UH no Kanban de Execução e notifica o perfil Manutenção — ver
    // comentário completo em cancelarCardsPorExclusaoDeUh
    // (packages/core/src/maintenanceCancelamentoPorLiberacao.ts). Best-effort
    // de propósito (try/catch): a renovação da UH em Housekeeping não pode
    // falhar por causa de um problema do lado de Manutenção.
    try {
      await cancelarCardsPorExclusaoDeUh({ tenantId, uhId, data, atorNome: session.nome });
    } catch (e) {
      console.error("[cancelarCardsPorExclusaoDeUh] falha ao cancelar cards de manutenção:", e);
    }

    // TODO: auto-trigger de relatório PDF + ranking do dia quando todas as UHs
    // restantes terminam (v1: envia PDF via react-pdf + ranking via Telegram) —
    // fatia futura, depende de lib/relatorio-dados e lib/telegram.

    return NextResponse.json({ ok: true });
  }

  // ── Salvar comentário na UH (independe de assignment) ─────────────
  // Restrito a MASTER/GERENTE/ATENDIMENTO (decisão explícita do Felipe) —
  // diferente de "set_observacao" acima, que é orientação pra camareira e
  // também é liberada pra GOVERNANTA.
  if (action === "set_comentario") {
    if (!isGerente) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    const texto = comentario?.trim() || null;
    await prisma.dailyUHSelection.update({
      where: { data_uhId: { data, uhId } },
      data: {
        comentario: texto,
        comentarioPorNome: texto ? session.nome : null,
        comentarioEm: texto ? new Date() : null,
      },
    });
    const uhComentario = await prisma.uH.findUnique({ where: { id: uhId }, select: { numero: true } });
    await emitEvent({
      tenantId,
      module: "HOUSEKEEPING",
      eventType: "housekeeping.log.comentario_uh_alterado",
      entityType: "DailyUHSelection",
      entityId: `${data}:${uhId}`,
      payload: { uhNumero: uhComentario?.numero ?? null, comentario: texto, atorNome: session.nome },
    });
    return NextResponse.json({ ok: true });
  }

  // ── Marcar UH como prioritária ────────────────────────────────────
  // Restrito a MASTER/GERENTE/ATENDIMENTO (mesma decisão de set_comentario).
  // Ao contrário do comentário (opcional), o motivo aqui é OBRIGATÓRIO
  // (pedido explícito do Felipe: "será obrigatório incluir um texto") —
  // reaproveita o campo `descricao` do body, mesmo usado por
  // registrar_queixa/toggle_manutencao abaixo.
  if (action === "set_prioridade") {
    if (!isGerente) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    const texto = descricao?.trim();
    if (!texto) return NextResponse.json({ error: "descricao obrigatória pra marcar prioridade" }, { status: 400 });
    await prisma.dailyUHSelection.update({
      where: { data_uhId: { data, uhId } },
      data: {
        prioridade: true,
        prioridadeDescricao: texto,
        prioridadePorNome: session.nome,
        prioridadeEm: new Date(),
      },
    });
    const uhPrioridade = await prisma.uH.findUnique({ where: { id: uhId }, select: { numero: true } });
    await emitEvent({
      tenantId,
      module: "HOUSEKEEPING",
      eventType: "housekeeping.log.prioridade_uh_alterada",
      entityType: "DailyUHSelection",
      entityId: `${data}:${uhId}`,
      payload: { uhNumero: uhPrioridade?.numero ?? null, acao: "marcada", descricao: texto, atorNome: session.nome },
    });
    return NextResponse.json({ ok: true });
  }

  // ── Remover prioridade da UH ──────────────────────────────────────
  if (action === "remover_prioridade") {
    if (!isGerente) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    await prisma.dailyUHSelection.update({
      where: { data_uhId: { data, uhId } },
      data: {
        prioridade: false,
        prioridadeDescricao: null,
        prioridadePorNome: null,
        prioridadeEm: null,
      },
    });
    const uhRemoverPrioridade = await prisma.uH.findUnique({ where: { id: uhId }, select: { numero: true } });
    await emitEvent({
      tenantId,
      module: "HOUSEKEEPING",
      eventType: "housekeeping.log.prioridade_uh_alterada",
      entityType: "DailyUHSelection",
      entityId: `${data}:${uhId}`,
      payload: { uhNumero: uhRemoverPrioridade?.numero ?? null, acao: "removida", atorNome: session.nome },
    });
    return NextResponse.json({ ok: true });
  }

  // ── Registrar queixa de hóspede (Limpeza ou Manutenção) ───────────
  // Restrito a MASTER/GERENTE/ATENDIMENTO. Sempre cria um card espelho em
  // Avaliações (Review, platform=INTERNO) tratado pela GERENTE dentro do
  // fluxo normal do Kanban. Se LIMPEZA e havia exatamente uma camareira
  // atribuída à UH no dia, desconta pontosDescontados fixo (30) do total
  // dela no período (ver api/scores/route.ts — penalidade independente, não
  // depende de sessão de limpeza existir). Se MANUTENCAO, notifica GERENTE +
  // MANUTENCAO via Telegram em vez de descontar pontos.
  if (action === "registrar_queixa") {
    if (!isGerente) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    const TIPOS_QUEIXA = ["LIMPEZA", "MANUTENCAO", "LAVANDERIA", "OUTRA"];
    if (!TIPOS_QUEIXA.includes(tipo)) {
      return NextResponse.json({ error: `tipo deve ser um de: ${TIPOS_QUEIXA.join(", ")}` }, { status: 400 });
    }
    const tituloTexto = titulo?.trim();
    if (!tituloTexto) return NextResponse.json({ error: "titulo obrigatório" }, { status: 400 });
    const texto = descricao?.trim();
    if (!texto) return NextResponse.json({ error: "descricao obrigatória" }, { status: 400 });

    // Anexos são opcionais — já foram enviados pro Cloudinary pelo cliente
    // (ver /api/upload, resourceType=auto) antes deste PATCH; aqui só
    // recebemos { url, fileName, fileSize }[] já prontos.
    const anexosValidos: { url: string; fileName: string; fileSize?: number }[] = Array.isArray(anexos)
      ? anexos.filter((a: any) => a?.url)
      : [];

    const uh = await prisma.uH.findUnique({ where: { id: uhId }, select: { numero: true, propertyId: true } });
    if (!uh) return NextResponse.json({ error: "UH não encontrada" }, { status: 404 });

    // Só penaliza quando há exatamente uma camareira atribuída — se houver
    // 0 ou 2+ (mutirão, que já não pontua pra ninguém), não há a quem
    // atribuir o desconto.
    const atribuicoesDoDia = await prisma.dailyAssignment.findMany({
      where: { tenantId, data, uhId },
      select: { camareiraId: true, camareira: { select: { nome: true } } },
    });
    // Camareira "envolvida" pro log: só faz sentido identificar uma quando há
    // exatamente uma atribuída à UH no dia (0 ou 2+ — mutirão — não têm a quem
    // atribuir). O desconto de pontos continua exclusivo de tipo === LIMPEZA;
    // o nome no log aparece pra qualquer tipo, como contexto.
    const atribuicaoUnica = atribuicoesDoDia.length === 1 ? atribuicoesDoDia[0] : null;
    const camareiraId = tipo === "LIMPEZA" ? atribuicaoUnica?.camareiraId ?? null : null;
    const camareiraNomeLog = atribuicaoUnica?.camareira.nome ?? null;
    const pontosDescontados = camareiraId ? 30 : null;

    const TIPO_LABEL: Record<string, string> = {
      LIMPEZA: "limpeza",
      MANUTENCAO: "manutenção",
      LAVANDERIA: "lavanderia",
      OUTRA: "outro assunto",
    };
    const tipoLabel = TIPO_LABEL[tipo] ?? tipo.toLowerCase();

    const review = await prisma.review.create({
      data: {
        tenantId,
        propertyId: uh.propertyId,
        platform: "INTERNO",
        guestName: tituloTexto,
        comment: `Queixa de ${tipoLabel} — UH ${uh.numero}\n\n${texto}`,
        ratingRaw: 1,
        ratingScaleMax: 5,
        ratingNormalized: 1,
        guestSubmittedAt: new Date(),
        collectedAt: new Date(),
        analysisDueAt: addBusinessDays(new Date(), 2),
      },
    });

    await prisma.reviewLog.create({
      data: {
        reviewId: review.id,
        actorId: session.userId,
        action: "CRIADO_QUEIXA_GOVERNANCA",
        detail: `Card "${tituloTexto}" criado automaticamente a partir de uma queixa de ${tipoLabel} registrada por ${session.nome} na tela Seleção e Liberação (UH ${uh.numero}).${
          camareiraNomeLog ? ` Camareira responsável pela UH no dia: ${camareiraNomeLog}.` : ""
        }`,
      },
    });

    // Anexos (opcionais) viram ReviewAttachment também — a GERENTE já vê
    // tudo dentro do card, sem precisar voltar pra Governança.
    if (anexosValidos.length > 0) {
      await prisma.reviewAttachment.createMany({
        data: anexosValidos.map((a) => ({
          reviewId: review.id,
          uploadedById: session.userId,
          fileName: a.fileName || a.url.split("/").pop() || "anexo",
          fileUrl: a.url,
          fileSize: a.fileSize ?? null,
        })),
      });
    }

    const complaint = await prisma.guestComplaint.create({
      data: {
        tenantId, data, uhId, tipo,
        titulo: tituloTexto,
        descricao: texto,
        anexos: JSON.stringify(anexosValidos),
        registradoPorId: session.userId,
        registradoPorNome: session.nome,
        camareiraId,
        pontosDescontados,
        reviewId: review.id,
      },
    });

    await emitEvent({
      tenantId,
      module: "HOUSEKEEPING",
      eventType: "housekeeping.log.queixa_registrada",
      entityType: "GuestComplaint",
      entityId: complaint.id,
      payload: {
        uhNumero: uh.numero,
        tipo,
        titulo: tituloTexto,
        descricao: texto,
        camareiraNome: camareiraNomeLog,
        pontosDescontados,
        atorNome: session.nome,
      },
    });

    // Limpeza já foi tratada acima (desconto de pontos, sem Telegram) — os
    // demais tipos notificam GERENTE + o cargo correspondente (Manutenção→
    // role MANUTENCAO, Lavanderia→role LAVANDERIA; Outra não tem cargo
    // específico, só GERENTE mesmo).
    const ROLES_POR_TIPO: Record<string, string[]> = {
      MANUTENCAO: ["GERENTE", "MANUTENCAO"],
      LAVANDERIA: ["GERENTE", "LAVANDERIA"],
      OUTRA: ["GERENTE"],
    };
    if (tipo !== "LIMPEZA") {
      const roles = ROLES_POR_TIPO[tipo] ?? ["GERENTE"];
      const destinatarios = await prisma.user.findMany({
        where: { tenantId, ativo: true, role: { in: roles } },
        select: { telegramChatId: true },
      });
      void notificarQueixa({
        destinatarios,
        tipo,
        titulo: tituloTexto,
        uhNumero: uh.numero,
        descricao: texto,
        registradoPorNome: session.nome,
      });
    }

    return NextResponse.json({ ok: true, reviewId: review.id, pontosDescontados });
  }

  // ── Salvar observação no assignment ──────────────────────────────
  if (action === "set_observacao") {
    if (!assignmentId) return NextResponse.json({ error: "assignmentId obrigatório" }, { status: 400 });
    const observacaoTexto = observacoes?.trim() || null;
    const assignmentObs = await prisma.dailyAssignment.update({
      where: { id: assignmentId },
      data: { observacoes: observacaoTexto },
      include: { uh: { select: { numero: true } }, camareira: { select: { nome: true } } },
    });
    await emitEvent({
      tenantId,
      module: "HOUSEKEEPING",
      eventType: "housekeeping.log.observacao_atribuicao_alterada",
      entityType: "DailyAssignment",
      entityId: assignmentId,
      payload: {
        uhNumero: assignmentObs.uh.numero,
        camareiraNome: assignmentObs.camareira.nome,
        observacoes: observacaoTexto,
        atorNome: session.nome,
      },
    });
    return NextResponse.json({ ok: true });
  }

  // ── Reeditar seleção (volta ao modo seleção) ──────────────────────
  if (action === "reeditar") {
    await prisma.dailySelectionStatus.upsert({
      where: { tenantId_data: { tenantId, data } },
      update: { confirmado: false },
      create: { tenantId, data, confirmado: false },
    });
    await emitEvent({
      tenantId,
      module: "HOUSEKEEPING",
      eventType: "housekeeping.log.selecao_reaberta",
      entityType: "DailySelectionStatus",
      entityId: data,
      payload: { data, atorNome: session.nome },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
}
