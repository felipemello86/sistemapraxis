import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma, sendPushToUser } from "@praxis/core";
import { dataAtualSP } from "@/lib/timezone";

// Portado de apps/housekeeping/src/app/api/atribuicoes/route.ts (v1) — agora
// completo (GET, POST, PATCH decidir_alteracao, DELETE), além do
// "solicitar_alteracao" que já existia numa versão mínima. Diferenças
// conscientes desta fatia:
//   - Removido o caminho de autenticação por token (substituta em cobertura
//     de folga acessando via Telegram) — v2 é só sessão/login.
//   - Notificações Telegram viraram `// TODO:`.
//   - hotelId → tenantId (schema único v2).

// ATENDIMENTO tem as mesmas permissões de GERENTE em todo o módulo
// Governança, exceto em Configurações (decisão explícita do Felipe) — ver
// mesmo comentário em selecao-uhs/route.ts.
function podeAtribuir(role: string) {
  return ["MASTER", "GERENTE", "GOVERNANTA", "ATENDIMENTO"].includes(role);
}

// GET /api/atribuicoes?data=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  const tenantId = session.tenantId;

  const data = req.nextUrl.searchParams.get("data") || dataAtualSP();

  const [assignments, selecoes] = await Promise.all([
    prisma.dailyAssignment.findMany({
      where: { tenantId, data },
      include: {
        uh: true,
        camareira: { select: { id: true, nome: true, telegramChatId: true, foto: true } },
        program: { select: { id: true, nome: true, tipo: true } },
        cleaningSession: {
          include: {
            steps: { include: { step: true } },
            inspection: { include: { itens: true } },
          },
        },
      },
      orderBy: { uh: { ordem: "asc" } },
      // relationJoins ligado no schema compartilhado (ver
      // packages/core/prisma/schema.prisma) — alimenta a tela de Atribuição
      // Diária, 5 relações aninhadas por linha.
      relationLoadStrategy: "join",
    }),
    prisma.dailyUHSelection.findMany({
      where: { tenantId, data },
      select: { uhId: true, liberada: true },
    }),
  ]);

  const liberadasSet = new Set(selecoes.filter((s) => s.liberada).map((s) => s.uhId));
  const result = assignments.map((a) =>
    a.status === "PENDENTE" && liberadasSet.has(a.uhId)
      ? { ...a, status: "LIBERADO" }
      : a
  );

  return NextResponse.json(result);
}

// POST /api/atribuicoes - criar/atualizar atribuição de camareira a uma UH
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  if (!podeAtribuir(session.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const tenantId = session.tenantId;

  const { data, uhId, camareiraId, programId, observacoes } = await req.json();
  if (!data || !uhId || !camareiraId) {
    return NextResponse.json({ error: "data, uhId e camareiraId são obrigatórios" }, { status: 400 });
  }

  const hoje = dataAtualSP();
  if ((data === hoje || !data) && session.role === "GOVERNANTA") {
    const cobertura = await prisma.coberturaFolga.findUnique({
      where: { tenantId_data: { tenantId, data: hoje } },
    });
    if (cobertura && cobertura.governantaId === session.userId) {
      return NextResponse.json(
        { error: "Você está de folga hoje. As atribuições são de responsabilidade da substituta." },
        { status: 403 }
      );
    }
  }

  try {
    const selecao = await prisma.dailyUHSelection.findUnique({
      where: { data_uhId: { data, uhId } },
      select: { liberada: true },
    });
    const statusInicial = selecao?.liberada ? "LIBERADO" : "PENDENTE";

    // Chave composta agora inclui camareiraId (ver comentário no schema) —
    // permite mais de uma camareira na mesma UH/dia. Se a mesma camareira já
    // tinha uma atribuição aqui, isso atualiza (troca de programa/obs); se é
    // uma camareira nova pra essa UH/dia, cria uma segunda linha em vez de
    // sobrescrever a atribuição existente.
    const assignment = await prisma.dailyAssignment.upsert({
      where: { data_uhId_camareiraId: { data, uhId, camareiraId } },
      update: { programId, status: statusInicial, observacoes: observacoes ?? null, criadoPorNome: session.nome },
      create: { tenantId, data, uhId, camareiraId, programId, status: statusInicial, observacoes: observacoes ?? null, criadoPorNome: session.nome },
      include: { uh: true, camareira: { select: { id: true, nome: true, role: true, foto: true, telegramChatId: true } } },
    });
    // Push (best-effort — sendPushToUser nunca lança erro, mas o await é
    // necessário: em serverless a function pode congelar logo após a
    // resposta ser enviada, cortando um envio "fire and forget" no meio).
    // Telegram continua TODO, depende de infra de bot que ainda não existe em v2.
    await sendPushToUser(camareiraId, {
      title: "Nova atribuição",
      body: `Você foi atribuída à UH ${assignment.uh.numero}${data ? ` (${data})` : ""}.`,
      data: { tipo: "atribuicao", uhId: assignment.uhId, data },
    });
    return NextResponse.json(assignment, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/atribuicoes - ações: liberar, notificar_dia, solicitar_alteracao, decidir_alteracao
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  const tenantId = session.tenantId;

  const body = await req.json();
  const { action, assignmentId, data } = body;

  // "solicitar_alteracao" é a única ação que a camareira (sem permissão de
  // atribuir) pode chamar.
  if (action !== "solicitar_alteracao" && !podeAtribuir(session.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  if (action === "liberar") {
    const assignment = await prisma.dailyAssignment.update({
      where: { id: assignmentId },
      data: { status: "LIBERADO", liberadaEm: new Date() },
      include: { uh: true, camareira: { select: { id: true, nome: true, role: true, foto: true, telegramChatId: true } } },
    });
    await prisma.uH.update({ where: { id: assignment.uhId }, data: { status: "DISPONIVEL" } });
    // Push notification quando quarto é liberado
    await sendPushToUser(assignment.camareiraId, {
      title: "Quarto liberado",
      body: `UH ${assignment.uh.numero} foi liberada para limpeza.`,
      data: { tipo: "quarto_liberado", uhId: assignment.uhId, data: assignment.data },
    });
    // TODO: notificar camareira via Telegram
    return NextResponse.json(assignment);
  }

  if (action === "notificar_dia") {
    const dataAtual = data || dataAtualSP();
    const assignments = await prisma.dailyAssignment.findMany({
      where: { tenantId, data: dataAtual },
      select: { camareiraId: true },
    });
    const porCamareira = new Map<string, number>();
    for (const a of assignments) {
      porCamareira.set(a.camareiraId, (porCamareira.get(a.camareiraId) ?? 0) + 1);
    }

    for (const [camareiraId, total] of porCamareira) {
      await sendPushToUser(camareiraId, {
        title: "Atribuições do dia",
        body: `Você tem ${total} UH${total === 1 ? "" : "s"} atribuída${total === 1 ? "" : "s"} hoje.`,
        data: { tipo: "atribuicoes_dia", data: dataAtual },
      });
    }

    const governantas = await prisma.user.findMany({
      where: { tenantId, ativo: true, role: "GOVERNANTA" },
      select: { id: true },
    });
    for (const g of governantas) {
      await sendPushToUser(g.id, {
        title: "Atribuições notificadas",
        body: `As atribuições de hoje foram enviadas para ${porCamareira.size} camareira${porCamareira.size === 1 ? "" : "s"}.`,
        data: { tipo: "atribuicoes_dia", data: dataAtual },
      });
    }

    // TODO: notificar cada camareira e as governantas via Telegram
    return NextResponse.json({ ok: true, notificados: porCamareira.size });
  }

  // ── Solicitar alteração (chamado pela camareira via sessão) ──────────
  // tipo: "TROCA_PROGRAMA" (padrão, pede pra virar Limpeza Específica) ou
  // "SUPER_LIMPEZA" (pede a Super Limpeza ⭐️ — aceita fotos junto).
  if (action === "solicitar_alteracao") {
    const { mensagem, tipo, fotos } = body;
    const tipoSolicitacao = tipo === "SUPER_LIMPEZA" ? "SUPER_LIMPEZA" : "TROCA_PROGRAMA";

    const assignment = await prisma.dailyAssignment.findUnique({
      where: { id: assignmentId },
      include: { uh: true, camareira: { select: { nome: true, foto: true } } },
    });
    if (!assignment || assignment.tenantId !== tenantId) {
      return NextResponse.json({ error: "Atribuição não encontrada" }, { status: 404 });
    }

    await prisma.dailyAssignment.update({
      where: { id: assignmentId },
      data: {
        solicitacaoMensagem: mensagem,
        solicitacaoStatus: "PENDENTE",
        solicitacaoTipo: tipoSolicitacao,
        solicitacaoFotos: JSON.stringify(Array.isArray(fotos) ? fotos : []),
      },
    });

    // Notifica as governantas do tenant (best-effort, não bloqueia a resposta).
    const governantas = await prisma.user.findMany({
      where: { tenantId, role: "GOVERNANTA", ativo: true },
      select: { id: true },
    });
    const titulo = tipoSolicitacao === "SUPER_LIMPEZA"
      ? "⭐️ Pedido de Super Limpeza"
      : "Solicitação de alteração";
    const corpo = `UH ${assignment.uh.numero} — ${assignment.camareira.nome}: "${mensagem}"`;
    for (const g of governantas) {
      await sendPushToUser(g.id, {
        title: titulo,
        body: corpo,
        data: { tipo: "solicitacao_alteracao", assignmentId, solicitacaoTipo: tipoSolicitacao },
      });
    }

    return NextResponse.json({ ok: true });
  }

  // ── Aprovar/rejeitar alteração (governanta) ───────────────────────────
  if (action === "decidir_alteracao") {
    const { aprovado } = body;

    const atual = await prisma.dailyAssignment.findUnique({
      where: { id: assignmentId },
      select: { solicitacaoMensagem: true, solicitacaoTipo: true },
    });
    if (!atual) return NextResponse.json({ error: "Atribuição não encontrada" }, { status: 404 });

    // TROCA_PROGRAMA (fluxo original) sempre mira "Limpeza Específica";
    // SUPER_LIMPEZA mira o programa Super Limpeza ⭐️ — cada solicitação
    // troca só o programa correspondente ao seu próprio tipo.
    const tipoAlvo = atual.solicitacaoTipo === "SUPER_LIMPEZA" ? "SUPER_LIMPEZA" : "LIMPEZA_COMPLETA";
    const programaAlvo = await prisma.cleaningProgram.findFirst({
      where: { tenantId, tipo: tipoAlvo },
    });

    const assignment = await prisma.dailyAssignment.update({
      where: { id: assignmentId },
      data: {
        solicitacaoStatus: aprovado ? "APROVADO" : "REJEITADO",
        ...(aprovado && programaAlvo ? {
          programId: programaAlvo.id,
          observacoes: atual.solicitacaoMensagem ?? null,
        } : {}),
      },
      include: { uh: true, camareira: { select: { id: true, nome: true, role: true, foto: true, telegramChatId: true } }, program: true },
    });

    const ehSuperLimpeza = atual.solicitacaoTipo === "SUPER_LIMPEZA";
    const tituloDecisao = aprovado
      ? (ehSuperLimpeza ? "⭐️ Super Limpeza aprovada" : "Alteração aprovada")
      : (ehSuperLimpeza ? "Super Limpeza indeferida" : "Alteração não aprovada");
    const corpoDecisao = aprovado
      ? (ehSuperLimpeza
          ? `UH ${assignment.uh.numero} agora vale 120 pts, sem controle de tempo (falhas na inspeção ainda descontam).`
          : `UH ${assignment.uh.numero} — sua solicitação foi aprovada.`)
      : `UH ${assignment.uh.numero} — pedido indeferido. O programa de arrumação continua o mesmo.`;
    await sendPushToUser(assignment.camareiraId, {
      title: tituloDecisao,
      body: corpoDecisao,
      data: { tipo: "decisao_alteracao", assignmentId, aprovado: String(aprovado) },
    });

    return NextResponse.json({ ok: true, assignment });
  }

  return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
}

// DELETE /api/atribuicoes?id=xxx
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  if (!podeAtribuir(session.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  await prisma.dailyAssignment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
