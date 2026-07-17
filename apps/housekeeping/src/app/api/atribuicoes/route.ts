import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Portado de apps/housekeeping/src/app/api/atribuicoes/route.ts (v1) — agora
// completo (GET, POST, PATCH decidir_alteracao, DELETE), além do
// "solicitar_alteracao" que já existia numa versão mínima. Diferenças
// conscientes desta fatia:
//   - Removido o caminho de autenticação por token (substituta em cobertura
//     de folga acessando via Telegram) — v2 é só sessão/login.
//   - Notificações Telegram viraram `// TODO:`.
//   - hotelId → tenantId (schema único v2).

function podeAtribuir(role: string) {
  return ["MASTER", "GERENTE", "GOVERNANTA"].includes(role);
}

// GET /api/atribuicoes?data=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  const tenantId = session.tenantId;

  const data = req.nextUrl.searchParams.get("data") || format(new Date(), "yyyy-MM-dd");

  const [assignments, selecoes] = await Promise.all([
    prisma.dailyAssignment.findMany({
      where: { tenantId, data },
      include: {
        uh: true,
        camareira: { select: { id: true, nome: true, telegramChatId: true } },
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

  const hoje = format(new Date(), "yyyy-MM-dd");
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

    const assignment = await prisma.dailyAssignment.upsert({
      where: { data_uhId: { data, uhId } },
      update: { camareiraId, programId, status: statusInicial, observacoes: observacoes ?? null, criadoPorNome: session.nome },
      create: { tenantId, data, uhId, camareiraId, programId, status: statusInicial, observacoes: observacoes ?? null, criadoPorNome: session.nome },
      include: { uh: true, camareira: true },
    });
    // TODO: notificar camareira via Telegram sobre a nova atribuição
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
      include: { uh: true, camareira: true },
    });
    await prisma.uH.update({ where: { id: assignment.uhId }, data: { status: "DISPONIVEL" } });
    // TODO: notificar camareira via Telegram
    return NextResponse.json(assignment);
  }

  if (action === "notificar_dia") {
    const dataAtual = data || format(new Date(), "yyyy-MM-dd");
    const assignments = await prisma.dailyAssignment.findMany({
      where: { tenantId, data: dataAtual },
      include: { camareira: true },
    });
    const porCamareira = new Map<string, number>();
    for (const a of assignments) {
      porCamareira.set(a.camareiraId, (porCamareira.get(a.camareiraId) ?? 0) + 1);
    }
    // TODO: notificar cada camareira e as governantas via Telegram
    return NextResponse.json({ ok: true, notificados: porCamareira.size });
  }

  // ── Solicitar alteração (chamado pela camareira via sessão) ──────────
  if (action === "solicitar_alteracao") {
    const { mensagem } = body;

    const assignment = await prisma.dailyAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment || assignment.tenantId !== tenantId) {
      return NextResponse.json({ error: "Atribuição não encontrada" }, { status: 404 });
    }

    await prisma.dailyAssignment.update({
      where: { id: assignmentId },
      data: { solicitacaoMensagem: mensagem, solicitacaoStatus: "PENDENTE" },
    });
    // TODO: notificar governantas via Telegram com link pra aprovar/rejeitar
    return NextResponse.json({ ok: true });
  }

  // ── Aprovar/rejeitar alteração (governanta) ───────────────────────────
  if (action === "decidir_alteracao") {
    const { aprovado } = body;

    const programaEspecifica = await prisma.cleaningProgram.findFirst({
      where: { tenantId, tipo: "LIMPEZA_COMPLETA" },
    });

    const atual = await prisma.dailyAssignment.findUnique({
      where: { id: assignmentId },
      select: { solicitacaoMensagem: true },
    });

    const assignment = await prisma.dailyAssignment.update({
      where: { id: assignmentId },
      data: {
        solicitacaoStatus: aprovado ? "APROVADO" : "REJEITADO",
        ...(aprovado && programaEspecifica ? {
          programId: programaEspecifica.id,
          observacoes: atual?.solicitacaoMensagem ?? null,
        } : {}),
      },
      include: { uh: true, camareira: true, program: true },
    });

    // TODO: notificar camareira via Telegram sobre a decisão
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
