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
  // Leitura sempre liberada, mesmo sem acesso ao módulo (ver comentário em
  // apps/maintenance/src/app/page.tsx) — POST/PATCH abaixo continuam gateados.

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

  // Dados pra etapa obrigatória "Necessidade de Manutenção?" (ver
  // CamareiraView, fase "manutencao") — quais itens de checklist da
  // Manutenção se aplicam a cada UH, e quais já estão NAO_CONFORME hoje
  // (pra avisar a camareira "já registrado" antes dela preencher a
  // descrição à toa). Mesma lógica de itensParaUnidade/
  // ultimaInspecaoPorUnidade de apps/maintenance/src/lib/domain.ts,
  // reimplementada aqui porque os apps não compartilham código de UI —
  // só o schema Prisma (packages/core).
  const uhIds = [...new Set(assignments.map((a) => a.uhId))];
  const [catalogo, atribuicoesCustom, inspecoes] = await Promise.all([
    prisma.maintenanceChecklistItem.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true, name: true, category: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.maintenanceUnitChecklistItem.findMany({
      where: { tenantId: session.tenantId, uhId: { in: uhIds } },
      select: { uhId: true, checklistItemId: true },
    }),
    prisma.maintenanceInspection.findMany({
      where: { tenantId: session.tenantId, uhId: { in: uhIds } },
      select: { uhId: true, date: true, items: { select: { checklistItemId: true, status: true } } },
    }),
  ]);

  const atribuicaoPorUh = new Map<string, Set<string>>();
  for (const a of atribuicoesCustom) {
    if (!atribuicaoPorUh.has(a.uhId)) atribuicaoPorUh.set(a.uhId, new Set());
    atribuicaoPorUh.get(a.uhId)!.add(a.checklistItemId);
  }

  const ultimaInspecaoPorUh = new Map<string, (typeof inspecoes)[number]>();
  for (const insp of inspecoes) {
    const atual = ultimaInspecaoPorUh.get(insp.uhId);
    if (!atual || insp.date > atual.date) ultimaInspecaoPorUh.set(insp.uhId, insp);
  }

  const pendentesPorUh = new Map<string, string[]>();
  for (const [uhId, insp] of ultimaInspecaoPorUh) {
    pendentesPorUh.set(
      uhId,
      insp.items.filter((it) => it.status === "NAO_CONFORME" && it.checklistItemId).map((it) => it.checklistItemId!),
    );
  }

  const assignmentsComReserva = assignments.map((a) => {
    const permitidos = atribuicaoPorUh.get(a.uhId);
    const manutencaoItens = !permitidos || permitidos.size === 0 ? catalogo : catalogo.filter((it) => permitidos.has(it.id));
    return {
      ...a,
      temReserva: reservaSet.has(a.uhId),
      manutencaoItens,
      manutencaoPendentes: pendentesPorUh.get(a.uhId) ?? [],
    };
  });

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

  // "Cancelar" — a camareira iniciou a limpeza de uma UH errada por engano
  // (ou por qualquer outro motivo de uso incorreto) e quer desfazer antes de
  // finalizar. Vale em qualquer sub-fase em andamento (checklist,
  // manutenção, fotos) — só não depois de já finalizada. Apaga a
  // CleaningSession inteira (onDelete: Cascade limpa os SessionStep, ver
  // schema) e devolve a atribuição/UH pro estado de antes de "Iniciar"
  // (LIBERADO / DISPONIVEL), como se a limpeza nunca tivesse começado.
  if (action === "cancelar") {
    const sessao = await prisma.cleaningSession.findUnique({ where: { id: sessaoId } });
    if (!sessao) return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
    if (sessao.camareiraId !== session.userId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }
    if (sessao.finalizadaEm) {
      return NextResponse.json({ error: "Essa limpeza já foi concluída, não é possível cancelar." }, { status: 400 });
    }

    await prisma.cleaningSession.delete({ where: { id: sessaoId } });
    await prisma.dailyAssignment.update({
      where: { id: sessao.assignmentId },
      data: { status: "LIBERADO" },
    });
    await prisma.uH.update({
      where: { id: sessao.uhId },
      data: { status: "DISPONIVEL" },
    });

    return NextResponse.json({ ok: true });
  }

  // Etapa obrigatória "Necessidade de Manutenção?", entre o checklist e as
  // fotos de conclusão (ver CamareiraView, fase "manutencao"). O tempo
  // gasto respondendo/registrando não deve contar contra a camareira — ver
  // comentário em CleaningSession.manutencaoSegundosExcluidos no schema.
  if (action === "iniciar_manutencao") {
    const sessao = await prisma.cleaningSession.findUnique({ where: { id: sessaoId } });
    if (!sessao) return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
    if (sessao.camareiraId !== session.userId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }
    // Idempotente: se já tem um manutencaoAbertaEm em aberto (ex.: o client
    // disparou duas vezes), não sobrescreve o timestamp original.
    if (!sessao.manutencaoAbertaEm) {
      await prisma.cleaningSession.update({ where: { id: sessaoId }, data: { manutencaoAbertaEm: agora } });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "concluir_manutencao") {
    const sessao = await prisma.cleaningSession.findUnique({ where: { id: sessaoId } });
    if (!sessao) return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
    if (sessao.camareiraId !== session.userId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }
    if (sessao.manutencaoAbertaEm) {
      const delta = Math.round((agora.getTime() - sessao.manutencaoAbertaEm.getTime()) / 1000);
      await prisma.cleaningSession.update({
        where: { id: sessaoId },
        data: {
          manutencaoAbertaEm: null,
          manutencaoSegundosExcluidos: sessao.manutencaoSegundosExcluidos + Math.max(0, delta),
        },
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "finalizar") {
    const sessao = await prisma.cleaningSession.findUnique({ where: { id: sessaoId } });
    if (!sessao) return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });

    const duracaoBruta = Math.round((agora.getTime() - sessao.iniciadaEm.getTime()) / 1000);
    // Desconta o tempo gasto na etapa "Necessidade de Manutenção?" — ver
    // comentário no schema (CleaningSession.manutencaoSegundosExcluidos).
    // Se por algum motivo a etapa nunca foi fechada (ex.: camareira saiu do
    // app no meio), fecha agora também, pra não vazar tempo não descontado.
    let segundosExcluidos = sessao.manutencaoSegundosExcluidos;
    if (sessao.manutencaoAbertaEm) {
      segundosExcluidos += Math.max(0, Math.round((agora.getTime() - sessao.manutencaoAbertaEm.getTime()) / 1000));
    }
    const duracao = Math.max(0, duracaoBruta - segundosExcluidos);

    const sessaoAtualizada = await prisma.cleaningSession.update({
      where: { id: sessaoId },
      data: {
        finalizadaEm: agora,
        duracaoSegundos: duracao,
        fotos: JSON.stringify(fotos || []),
        observacoes,
        comentarioCamareira: comentarioCamareira || null,
        manutencaoAbertaEm: null,
        manutencaoSegundosExcluidos: segundosExcluidos,
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
