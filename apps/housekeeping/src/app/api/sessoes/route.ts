import { NextRequest, NextResponse } from "next/server";
import { prisma, getSession, hasModuleAccess, sendPushToUser } from "@praxis/core";
import { dataAtualSP } from "@/lib/timezone";

// Portado de apps/housekeeping/src/app/api/sessoes/route.ts (v1). Diferenças:
// - hotelId virou tenantId (mesmo Tenant do suite_core, sem soft-link)
// - autenticação é só a sessão única (praxis_v2_session) — o caminho por
//   token (link público do Telegram) fica pra quando o bot for portado
// - notificação da governanta via Telegram fica como TODO (lib/telegram e
//   lib/destinatarios ainda não existem nesta v2)

// GET /api/sessoes?date=YYYY-MM-DD — atribuições do dia da camareira logada
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso a este módulo" }, { status: 403 });
  }

  const dateParam = req.nextUrl.searchParams.get("date");
  const dateStr = dateParam || dataAtualSP();

  const [assignments, selecoes] = await Promise.all([
    prisma.dailyAssignment.findMany({
      where: { tenantId: session.tenantId, camareiraId: session.userId, data: dateStr },
      include: {
        uh: true,
        program: { include: { steps: { orderBy: { ordem: "asc" } } } },
        cleaningSession: {
          include: {
            steps: { include: { step: true }, orderBy: { ordem: "asc" } },
          },
        },
      },
      orderBy: { uh: { ordem: "asc" } },
      // relationJoins ligado no schema compartilhado (ver
      // packages/core/prisma/schema.prisma) — "Minhas UHs" é bem polida
      // pela camareira, então o join reduz bastante o número de idas ao
      // banco por requisição.
      relationLoadStrategy: "join",
    }),
    prisma.dailyUHSelection.findMany({
      where: { tenantId: session.tenantId, data: dateStr },
      select: { uhId: true, temReserva: true },
    }),
  ]);

  const reservaSet = new Set(selecoes.filter((s) => s.temReserva).map((s) => s.uhId));
  const assignmentsComReserva = assignments.map((a) => ({
    ...a,
    temReserva: reservaSet.has(a.uhId),
  }));

  return NextResponse.json({ assignments: assignmentsComReserva, user: { nome: session.nome } });
}

// POST /api/sessoes — iniciar limpeza de uma UH
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso a este módulo" }, { status: 403 });
  }

  const { assignmentId } = await req.json();

  const assignment = await prisma.dailyAssignment.findUnique({
    where: { id: assignmentId },
    include: { program: { include: { steps: { orderBy: { ordem: "asc" } } } } },
  });

  if (!assignment) return NextResponse.json({ error: "Atribuição não encontrada" }, { status: 404 });
  if (assignment.tenantId !== session.tenantId) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  if (assignment.camareiraId !== session.userId) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const agora = new Date();

  const sessao = await prisma.cleaningSession.create({
    data: {
      assignmentId,
      uhId: assignment.uhId,
      camareiraId: session.userId,
      iniciadaEm: agora,
      steps: {
        create:
          assignment.program?.steps.map((s) => ({
            stepId: s.id,
            ordem: s.ordem,
            iniciadoEm: agora,
          })) ?? [],
      },
    },
    include: { steps: { include: { step: true } } },
  });

  await prisma.dailyAssignment.update({
    where: { id: assignmentId },
    data: { status: "EM_ANDAMENTO" },
  });
  await prisma.uH.update({
    where: { id: assignment.uhId },
    data: { status: "EM_LIMPEZA" },
  });

  return NextResponse.json(sessao, { status: 201 });
}

// PATCH /api/sessoes — avançar etapa, ou finalizar
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso a este módulo" }, { status: 403 });
  }

  const { action, sessaoId, stepId, fotos, observacoes, comentarioCamareira } = await req.json();
  const agora = new Date();

  if (action === "concluir_step") {
    const stepAtual = await prisma.sessionStep.findUnique({ where: { id: stepId } });
    if (!stepAtual) return NextResponse.json({ error: "Etapa não encontrada" }, { status: 404 });

    await prisma.sessionStep.update({
      where: { id: stepId },
      data: {
        finalizadoEm: agora,
        duracaoSegundos: Math.round((agora.getTime() - stepAtual.iniciadoEm.getTime()) / 1000),
      },
    });

    const proximasEtapas = await prisma.sessionStep.findMany({
      where: { sessionId: sessaoId, finalizadoEm: null },
      orderBy: { ordem: "asc" },
    });
    if (proximasEtapas.length > 0) {
      await prisma.sessionStep.update({
        where: { id: proximasEtapas[0].id },
        data: { iniciadoEm: agora },
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "finalizar") {
    const sessao = await prisma.cleaningSession.findUnique({ where: { id: sessaoId } });
    if (!sessao) return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });

    const duracao = Math.round((agora.getTime() - sessao.iniciadaEm.getTime()) / 1000);

    const sessaoAtualizada = await prisma.cleaningSession.update({
      where: { id: sessaoId },
      data: {
        finalizadaEm: agora,
        duracaoSegundos: duracao,
        fotos: JSON.stringify(fotos || []),
        observacoes,
        comentarioCamareira: comentarioCamareira || null,
      },
      include: { assignment: { include: { uh: true } }, camareira: true },
    });

    await prisma.dailyAssignment.update({
      where: { id: sessaoAtualizada.assignmentId },
      data: { status: "CONCLUIDO" },
    });
    await prisma.uH.update({
      where: { id: sessaoAtualizada.uhId },
      data: { status: "AGUARDANDO_INSPECAO" },
    });

    const governantas = await prisma.user.findMany({
      where: { tenantId: session.tenantId, ativo: true, role: "GOVERNANTA" },
      select: { id: true },
    });
    for (const g of governantas) {
      await sendPushToUser(g.id, {
        title: "UH pronta para inspeção",
        body: `UH ${sessaoAtualizada.assignment.uh.numero} foi finalizada por ${sessaoAtualizada.camareira.nome}.`,
        data: { tipo: "sessao_finalizada", uhId: sessaoAtualizada.uhId },
      });
    }

    // TODO: notificar governanta(s) via Telegram quando o bot for portado
    // pra esta v2 (ver lib/telegram.ts e lib/destinatarios.ts do v1 como
    // referência — apps/housekeeping/src/lib/telegram.ts).

    return NextResponse.json(sessaoAtualizada);
  }

  // "Editar fotos" — a camareira já concluiu a UH (ver Minhas UHs) e percebeu
  // que anexou foto errada ou no lugar errado. Restrito à própria camareira
  // dona da sessão; só se aplica depois de finalizada (antes disso, a edição
  // já acontece naturalmente na tela de fotos, sem precisar desta ação).
  // Registra quem/quando editou por último pra aparecer no Log do Sistema
  // (ver /api/logs, evento FOTOS_EDITADAS) — mesmo padrão "timestamp + nome"
  // já usado em outros lugares deste domínio (ex: DailyUHSelection).
  if (action === "editar_fotos") {
    const sessao = await prisma.cleaningSession.findUnique({ where: { id: sessaoId } });
    if (!sessao) return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
    if (sessao.camareiraId !== session.userId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }
    if (!sessao.finalizadaEm) {
      return NextResponse.json({ error: "Só é possível editar fotos de uma UH já concluída." }, { status: 400 });
    }

    const sessaoAtualizada = await prisma.cleaningSession.update({
      where: { id: sessaoId },
      data: {
        fotos: JSON.stringify(fotos || {}),
        fotosEditadasEm: agora,
        fotosEditadasPorNome: session.nome,
      },
    });

    return NextResponse.json(sessaoAtualizada);
  }

  return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
}
