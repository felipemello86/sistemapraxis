import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { getSession, hasModuleAccess, prisma, sendPushToUser } from "@praxis/core";
import { notificarQueixa } from "@/lib/telegram";
import { liberarLateCheckoutsVencidos } from "@/lib/late-checkout";

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
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  const tenantId = session.tenantId;

  const data = req.nextUrl.searchParams.get("data") || format(new Date(), "yyyy-MM-dd");

  // Best-effort: se alguma UH marcada como Late Check-out já passou da hora
  // de saída, libera sozinha antes de montar a resposta. Nunca deve travar
  // a tela por causa disso.
  try {
    await liberarLateCheckoutsVencidos(tenantId);
  } catch (e) {
    console.error("[late-checkout] falha ao liberar automaticamente:", e);
  }

  const [status, selecoes, assignments, queixas] = await Promise.all([
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
    prisma.guestComplaint.findMany({
      where: { tenantId, data },
      select: { id: true, uhId: true, titulo: true, tipo: true, descricao: true, pontosDescontados: true, anexos: true, createdAt: true },
    }),
  ]);

  const assignmentByUH = Object.fromEntries(assignments.map((a) => [a.uhId, a]));
  const queixasByUH = new Map<string, typeof queixas>();
  for (const q of queixas) {
    queixasByUH.set(q.uhId, [...(queixasByUH.get(q.uhId) ?? []), q]);
  }

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

  const { action, data, uhId, assignmentId, descricao, observacoes, comentario, tipo, anexos, titulo, horaSaida } = await req.json();

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
      const assignment = await prisma.dailyAssignment.update({
        where: { id: assignmentId },
        data: { status: "LIBERADO", liberadaEm: new Date() },
        include: { uh: { select: { numero: true } } },
      });
      // Push (best-effort) — Telegram continua TODO.
      void sendPushToUser(assignment.camareiraId, {
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
    return NextResponse.json({ ok: true });
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
      select: { camareiraId: true },
    });
    const camareiraId =
      tipo === "LIMPEZA" && atribuicoesDoDia.length === 1 ? atribuicoesDoDia[0].camareiraId : null;
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
        detail: `Card "${tituloTexto}" criado automaticamente a partir de uma queixa de ${tipoLabel} registrada por ${session.nome} na tela Seleção e Liberação (UH ${uh.numero}).`,
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

    await prisma.guestComplaint.create({
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
