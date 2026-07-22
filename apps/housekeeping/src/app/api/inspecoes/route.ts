import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma, sendPushToUser } from "@praxis/core";
import { dataAtualSP } from "@/lib/timezone";

// Portado de apps/housekeeping/src/app/api/inspecoes/route.ts (v1).
// Diferenças conscientes desta fatia:
//   - Removido o caminho de autenticação por token (link público /g/[token]
//     pra governanta) — v2 é só sessão/login.
//   - Notificações Telegram (gerente, score da camareira, score do dia)
//     viraram `// TODO:`.
//   - O gatilho de "todas as UHs inspecionadas → fluxo de finalização do dia"
//     (ranking, exclusão de UH do score, confirmação, PDF) é uma fatia
//     própria futura (depende de /api/finalizacao-dia, não portado ainda) —
//     por enquanto só loga no console quando detecta isso.
//   - hotelId → tenantId (schema único v2).

export const runtime = "nodejs";
export const maxDuration = 60;

const INSPECTION_TEMPLATE = [
  { categoria: "CAMA", item: "Lençol bem esticado, sem rugas", ordem: 1 },
  { categoria: "CAMA", item: "Lençol alinhado corretamente", ordem: 2 },
  { categoria: "CAMA", item: "Colcha/edredom bem posicionado", ordem: 3 },
  { categoria: "CAMA", item: "Toalhas limpas, dobradas e posicionadas", ordem: 4 },
  { categoria: "CAMA", item: "Travesseiros organizados e padronizados", ordem: 5 },
  { categoria: "BANHEIRO", item: "Vaso sanitário limpo", ordem: 6 },
  { categoria: "BANHEIRO", item: "Box/chuveiro higienizado e seco", ordem: 7 },
  { categoria: "BANHEIRO", item: "Papel higiênico disponível e bem colocado", ordem: 8 },
  { categoria: "BANHEIRO", item: "Lixo retirado e saco reposto", ordem: 9 },
  { categoria: "BANHEIRO", item: "Aroma agradável", ordem: 10 },
  { categoria: "BANHEIRO", item: "Pia limpa e sem manchas", ordem: 11 },
  { categoria: "QUARTO", item: "Lixo retirado e saco reposto", ordem: 12 },
  { categoria: "QUARTO", item: "Chão limpo (varrido e mopeado)", ordem: 13 },
  { categoria: "QUARTO", item: "Cadeiras e mesa alinhadas", ordem: 14 },
  { categoria: "QUARTO", item: "Controles remotos bem posicionados", ordem: 15 },
  { categoria: "QUARTO", item: "Controles remotos e maçanetas limpas", ordem: 16 },
  { categoria: "QUARTO", item: "Móveis e mesas limpas", ordem: 17 },
  { categoria: "QUARTO", item: "Aroma agradável", ordem: 18 },
  { categoria: "COZINHA", item: "Louça lavada", ordem: 19 },
  { categoria: "COZINHA", item: "Panelas completas e organizadas", ordem: 20 },
  { categoria: "COZINHA", item: "Talheres, xícaras, copos e pratos organizados", ordem: 21 },
  { categoria: "COZINHA", item: "Pano de prato e papel toalha disponíveis", ordem: 22 },
];

// GET /api/inspecoes - lista UHs prontas para inspeção hoje
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Leitura sempre liberada, mesmo sem acesso ao módulo (ver comentário em
  // apps/maintenance/src/app/page.tsx) — POST/PATCH abaixo continuam gateados.
  const tenantId = session.tenantId;
  const hoje = dataAtualSP();

  const sessions = await prisma.cleaningSession.findMany({
    where: {
      uh: { tenantId },
      finalizadaEm: { not: null },
      assignment: {
        data: hoje,
        status: { in: ["CONCLUIDO", "INSPECIONADO"] },
      },
    },
    include: {
      uh: true,
      camareira: { select: { nome: true } },
      assignment: true,
      inspection: {
        include: { itens: { orderBy: { ordem: "asc" } } },
      },
    },
    orderBy: { finalizadaEm: "asc" },
    // relationJoins ligado no schema compartilhado (ver
    // packages/core/prisma/schema.prisma).
    relationLoadStrategy: "join",
  });

  return NextResponse.json(sessions);
}

// POST /api/inspecoes - iniciar inspeção de uma sessão
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { sessaoId } = await req.json();

  const sessao = await prisma.cleaningSession.findUnique({
    where: { id: sessaoId },
    include: { uh: true, inspection: true },
  });
  if (!sessao) return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
  if (sessao.inspection) return NextResponse.json({ error: "Inspeção já iniciada" }, { status: 409 });

  const tenantId = sessao.uh.tenantId;
  const templateDB = await prisma.inspectionTemplate.findMany({
    where: { tenantId, ativo: true },
    orderBy: { ordem: "asc" },
  });
  const template = templateDB.length > 0
    ? templateDB.map((t) => ({ categoria: t.categoria, item: t.item, ordem: t.ordem }))
    : INSPECTION_TEMPLATE;

  const inspecao = await prisma.inspectionSession.create({
    data: {
      sessionId: sessaoId,
      uhId: sessao.uhId,
      governantaId: session.userId,
      iniciadaEm: new Date(),
      itens: { create: template },
    },
    include: { itens: { orderBy: { ordem: "asc" } } },
  });

  return NextResponse.json(inspecao, { status: 201 });
}

// PATCH /api/inspecoes - ações: avaliar_item, corrigir, finalizar
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const body = await req.json();
  const { action, inspecaoId, itemId, resultado, tipoFalha, comentarioGovernanta } = body;

  if (action === "avaliar_item") {
    const item = await prisma.inspectionItem.update({
      where: { id: itemId },
      data: {
        resultado,
        observacao: body.observacao,
        tipoFalha: resultado === "FALHA" ? (tipoFalha || "CAMAREIRA") : "CAMAREIRA",
      },
    });
    return NextResponse.json(item);
  }

  if (action === "corrigir") {
    const itens = await prisma.inspectionItem.findMany({ where: { inspectionId: inspecaoId } });
    const totalFalhas = itens.filter((i) => i.resultado === "FALHA" && i.tipoFalha === "CAMAREIRA").length;
    const totalFalhasGerenciais = itens.filter((i) => i.resultado === "FALHA" && i.tipoFalha === "GERENCIAL").length;

    const inspecao = await prisma.inspectionSession.update({
      where: { id: inspecaoId },
      data: { totalFalhas, totalFalhasGerenciais },
      include: { itens: true },
    });

    return NextResponse.json(inspecao);
  }

  if (action === "finalizar") {
    const itens = await prisma.inspectionItem.findMany({ where: { inspectionId: inspecaoId } });
    const totalFalhas = itens.filter((i) => i.resultado === "FALHA" && i.tipoFalha === "CAMAREIRA").length;
    const totalFalhasGerenciais = itens.filter((i) => i.resultado === "FALHA" && i.tipoFalha === "GERENCIAL").length;

    const inspecao = await prisma.inspectionSession.update({
      where: { id: inspecaoId },
      data: { finalizadaEm: new Date(), totalFalhas, totalFalhasGerenciais, comentarioGovernanta: comentarioGovernanta || null },
      include: {
        session: { select: { assignmentId: true, camareiraId: true } },
        uh: { select: { numero: true } },
      },
    });

    await prisma.dailyAssignment.update({
      where: { id: inspecao.session.assignmentId },
      data: { status: "INSPECIONADO" },
    });
    await prisma.uH.update({ where: { id: inspecao.uhId }, data: { status: "PRONTO" } });

    // Push pra camareira com o resultado da própria UH.
    await sendPushToUser(inspecao.session.camareiraId, {
      title: totalFalhas > 0
        ? `UH ${inspecao.uh.numero}: ${totalFalhas} falha${totalFalhas === 1 ? "" : "s"}`
        : `UH ${inspecao.uh.numero} aprovada`,
      body: totalFalhas > 0
        ? `Sua limpeza teve ${totalFalhas} falha${totalFalhas === 1 ? "" : "s"} na inspeção.`
        : "Sua limpeza foi aprovada sem falhas.",
      data: { tipo: "inspecao_finalizada", uhId: inspecao.uhId },
    });

    // Push pra gerentes/master avisando que a inspeção foi concluída.
    const gerentes = await prisma.user.findMany({
      where: { tenantId: session.tenantId, ativo: true, role: { in: ["MASTER", "GERENTE"] } },
      select: { id: true },
    });
    for (const g of gerentes) {
      await sendPushToUser(g.id, {
        title: "Inspeção concluída",
        body: `UH ${inspecao.uh.numero} foi inspecionada (${totalFalhas} falha${totalFalhas === 1 ? "" : "s"}).`,
        data: { tipo: "inspecao_finalizada", uhId: inspecao.uhId },
      });
    }

    // TODO: notificar gerentes/camareira via Telegram quando o bot for portado.
    // TODO: quando todas as UHs do tenant forem inspecionadas, disparar o
    // fluxo de finalização do dia (ranking + PDF) — depende de
    // /api/finalizacao-dia, fatia futura.

    return NextResponse.json(inspecao);
  }

  return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
}
