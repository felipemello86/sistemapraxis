import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

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
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  const tenantId = session.tenantId;

  const data = req.nextUrl.searchParams.get("data") || format(new Date(), "yyyy-MM-dd");

  const [status, selecoes, assignments] = await Promise.all([
    prisma.dailySelectionStatus.findUnique({ where: { tenantId_data: { tenantId, data } } }),
    prisma.dailyUHSelection.findMany({
      where: { tenantId, data },
      include: { uh: { select: { id: true, numero: true, emManutencao: true, manutencaoDescricao: true } } },
      relationLoadStrategy: "join",
    }),
    prisma.dailyAssignment.findMany({
      where: { tenantId, data },
      include: { camareira: { select: { id: true, nome: true, telegramChatId: true } } },
      relationLoadStrategy: "join",
    }),
  ]);

  const assignmentByUH = Object.fromEntries(assignments.map((a) => [a.uhId, a]));

  return NextResponse.json({
    confirmado: status?.confirmado ?? false,
    uhs: selecoes.map((s) => {
      const a = assignmentByUH[s.uhId];
      return {
        uhId: s.uhId,
        numero: s.uh.numero,
        liberada: s.liberada,
        liberadaEm: s.liberadaEm,
        temReserva: s.temReserva,
        emManutencao: s.uh.emManutencao,
        manutencaoDescricao: s.uh.manutencaoDescricao ?? null,
        assignmentId: a?.id ?? null,
        camareiraId: a?.camareiraId ?? null,
        camareiraNome: a?.camareira.nome ?? null,
        assignmentStatus: a?.status ?? null,
        observacoes: a?.observacoes ?? null,
        comentario: s.comentario ?? null,
        comentarioPorNome: s.comentarioPorNome ?? null,
        comentarioEm: s.comentarioEm ?? null,
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
  const liberadasMap = Object.fromEntries(existentes.map((e) => [e.uhId, e]));

  const idsAntigos = new Set(existentes.map((e) => e.uhId));
  const idsNovos = new Set((uhIds ?? []) as string[]);
  const removidasIds = [...idsAntigos].filter((id) => !idsNovos.has(id));
  // const adicionadasIds = [...idsNovos].filter((id) => !idsAntigos.has(id));
  // TODO: notificar governanta/suporte via Telegram sobre UHs adicionadas/removidas em edição

  if (removidasIds.length > 0) {
    await prisma.dailyAssignment.deleteMany({
      where: { tenantId, data, uhId: { in: removidasIds } },
    });
  }

  await prisma.dailyUHSelection.deleteMany({ where: { tenantId, data } });

  if (uhIds && uhIds.length > 0) {
    await prisma.dailyUHSelection.createMany({
      data: uhIds.map((uhId: string) => ({
        tenantId, data, uhId,
        liberada: liberadasMap[uhId]?.liberada ?? false,
        liberadaEm: liberadasMap[uhId]?.liberadaEm ?? null,
        temReserva: liberadasMap[uhId]?.temReserva ?? false,
      })),
    });
  }

  await prisma.dailySelectionStatus.upsert({
    where: { tenantId_data: { tenantId, data } },
    update: { confirmado: false },
    create: { tenantId, data, confirmado: false },
  });

  return NextResponse.json({ ok: true });
}

// PATCH /api/selecao-uhs — ações: confirmar, liberar, desfazer_liberacao, toggle_manutencao,
// toggle_reserva, renovar, set_observacao, reeditar
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

  const { action, data, uhId, assignmentId, descricao, observacoes, comentario } = await req.json();

  const acoesGovernanta = ["toggle_manutencao", "toggle_reserva", "liberar", "desfazer_liberacao"];
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
      await prisma.dailyAssignment.update({
        where: { id: assignmentId },
        data: { status: "LIBERADO", liberadaEm: new Date() },
      });
      // TODO: notificar camareira via Telegram que a UH foi liberada
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

      // TODO: notificar camareira, governantas e gerente via Telegram

      return NextResponse.json({ ok: true });
    }

    await prisma.dailyUHSelection.update({
      where: { data_uhId: { data, uhId } },
      data: { liberada: false, liberadaEm: null },
    });
    return NextResponse.json({ ok: true });
  }

  // ── Toggle manutenção ─────────────────────────────────────────────
  if (action === "toggle_manutencao") {
    const uh = await prisma.uH.findUnique({
      where: { id: uhId },
      select: { numero: true, emManutencao: true },
    });
    const novoValor = !(uh?.emManutencao ?? false);
    await prisma.uH.update({
      where: { id: uhId },
      data: {
        emManutencao: novoValor,
        manutencaoDescricao: novoValor ? (descricao ?? null) : null,
      },
    });

    // Ao ativar manutenção: trocar programa ARRUMACAO → LIMPEZA_COMPLETA
    if (novoValor && uh) {
      const [assignment, programaLimpezaEspecifica] = await Promise.all([
        prisma.dailyAssignment.findFirst({
          where: { tenantId, data, uhId },
          include: { program: { select: { id: true, tipo: true } } },
        }),
        prisma.cleaningProgram.findFirst({ where: { tenantId, tipo: "LIMPEZA_COMPLETA" } }),
      ]);

      if (assignment && assignment.program?.tipo === "ARRUMACAO" && programaLimpezaEspecifica) {
        await prisma.dailyAssignment.update({
          where: { id: assignment.id },
          data: { programId: programaLimpezaEspecifica.id },
        });
      }
      // TODO: notificar camareira/governantas/gerentes via Telegram sobre a manutenção
    }

    return NextResponse.json({ emManutencao: novoValor });
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
    return NextResponse.json({ temReserva: novoValor });
  }

  // ── Renovação — remove assignment + selection do dia ─────────────
  if (action === "renovar") {
    if (!isGerente) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    if (assignmentId) {
      const assignment = await prisma.dailyAssignment.findUnique({
        where: { id: assignmentId },
        include: { cleaningSession: { include: { inspection: true } } },
      });
      if (!assignment) return NextResponse.json({ error: "Atribuição não encontrada" }, { status: 404 });

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
    }

    await prisma.dailyUHSelection.delete({ where: { data_uhId: { data, uhId } } });

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
    return NextResponse.json({ ok: true });
  }

  // ── Salvar observação no assignment ──────────────────────────────
  if (action === "set_observacao") {
    if (!assignmentId) return NextResponse.json({ error: "assignmentId obrigatório" }, { status: 400 });
    await prisma.dailyAssignment.update({
      where: { id: assignmentId },
      data: { observacoes: observacoes?.trim() || null },
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
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
}
