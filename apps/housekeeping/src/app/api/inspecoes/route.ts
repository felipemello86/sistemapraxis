import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, notificarPorRoles, prisma, sendPushToUser } from "@praxis/core";
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

  // Dados pra etapa obrigatória "Necessidade de Manutenção?" da governanta
  // (ver GovernantaView, gate antes de "Finalizar Inspeção") — mesma lógica
  // de itensParaUnidade/ultimaInspecaoPorUnidade de
  // apps/maintenance/src/lib/domain.ts, já replicada em /api/sessoes (ver
  // comentário lá) pro mesmo passo do lado da camareira.
  const uhIds = [...new Set(sessions.map((s) => s.uhId))];
  const [catalogo, atribuicoesCustom, inspecoesManutencao] = await Promise.all([
    prisma.maintenanceChecklistItem.findMany({
      where: { tenantId },
      select: { id: true, name: true, category: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.maintenanceUnitChecklistItem.findMany({
      where: { tenantId, uhId: { in: uhIds } },
      select: { uhId: true, checklistItemId: true },
    }),
    prisma.maintenanceInspection.findMany({
      where: { tenantId, uhId: { in: uhIds } },
      select: { uhId: true, date: true, items: { select: { checklistItemId: true, status: true } } },
    }),
  ]);

  const atribuicaoPorUh = new Map<string, Set<string>>();
  for (const a of atribuicoesCustom) {
    if (!atribuicaoPorUh.has(a.uhId)) atribuicaoPorUh.set(a.uhId, new Set());
    atribuicaoPorUh.get(a.uhId)!.add(a.checklistItemId);
  }

  const ultimaInspecaoPorUh = new Map<string, (typeof inspecoesManutencao)[number]>();
  for (const insp of inspecoesManutencao) {
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

  const sessionsComManutencao = sessions.map((s) => {
    const permitidos = atribuicaoPorUh.get(s.uhId);
    const manutencaoItens = !permitidos || permitidos.size === 0 ? catalogo : catalogo.filter((it) => permitidos.has(it.id));
    return {
      ...s,
      manutencaoItens,
      manutencaoPendentes: pendentesPorUh.get(s.uhId) ?? [],
    };
  });

  return NextResponse.json(sessionsComManutencao);
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
  // tipoFalha (CAMAREIRA/GERENCIAL) vem fixo do template de configuração
  // (Configurações > Checklist de inspeção) — copiado aqui pro
  // InspectionItem e daí em diante imutável durante a inspeção em si (ver
  // PATCH abaixo, ação avaliar_item). Fallback hardcoded não tem o campo —
  // cai no default CAMAREIRA do schema.
  const template = templateDB.length > 0
    ? templateDB.map((t) => ({ categoria: t.categoria, item: t.item, ordem: t.ordem, tipoFalha: t.tipoFalha }))
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
    const itemAtual = await prisma.inspectionItem.findUnique({
      where: { id: itemId },
      include: { inspection: { select: { uhId: true, uh: { select: { numero: true, tenantId: true } } } } },
    });
    if (!itemAtual) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });

    // tipoFalha agora é fixo por item — definido em Configurações >
    // Checklist de inspeção (InspectionTemplate.tipoFalha), copiado pro
    // InspectionItem na criação da InspectionSession (ver POST acima). Não
    // é mais escolhido durante a inspeção: ignora qualquer `tipoFalha`
    // vindo do body (mantido no destructure só por compat de payloads
    // antigos em cache no client).
    void tipoFalha;
    const tipoFalhaFixo = itemAtual.tipoFalha;

    // Descrição obrigatória pra falha gerencial (pedido explícito — vira o
    // texto do card em "Falhas Gerenciais"). Aceita tanto a observação
    // mandada nesta chamada quanto uma já salva antes (ex.: modo "corrigir",
    // que reenvia resultado sem observação — ver salvarCorrecao no client).
    const observacaoFinal = body.observacao !== undefined ? body.observacao : itemAtual.observacao;
    if (resultado === "FALHA" && tipoFalhaFixo === "GERENCIAL" && !String(observacaoFinal || "").trim()) {
      return NextResponse.json({ error: "Descreva o problema pra registrar uma falha gerencial." }, { status: 400 });
    }

    const item = await prisma.inspectionItem.update({
      where: { id: itemId },
      data: {
        resultado,
        observacao: body.observacao,
      },
    });

    // Falha Gerencial → mantém em sincronia com o kanban "Falhas Gerenciais"
    // (ver packages/core, novo model HkManagerialFailureCard): cria o card
    // (+ notifica Gerente/Master) na primeira vez que o item vira FALHA;
    // atualiza a descrição se ela mudar enquanto ainda PENDENTE; apaga o
    // card se a governanta desfizer a falha antes dele ser resolvido. Nunca
    // mexe num card já RESOLVIDO.
    if (tipoFalhaFixo === "GERENCIAL") {
      const cardExistente = await prisma.hkManagerialFailureCard.findUnique({ where: { inspectionItemId: itemId } });

      if (resultado === "FALHA") {
        if (!cardExistente) {
          await prisma.hkManagerialFailureCard.create({
            data: {
              tenantId: itemAtual.inspection.uh.tenantId,
              inspectionItemId: itemId,
              uhId: itemAtual.inspection.uhId,
              itemNome: itemAtual.item,
              descricao: String(observacaoFinal || "").trim(),
            },
          });
          await notificarPorRoles(itemAtual.inspection.uh.tenantId, ["GERENTE", "MASTER"], {
            title: "🏢 Falha gerencial registrada",
            body: `UH ${itemAtual.inspection.uh.numero} — ${itemAtual.item}`,
            data: { view: "falhas-gerenciais" },
          });
        } else if (cardExistente.status === "PENDENTE" && body.observacao !== undefined) {
          await prisma.hkManagerialFailureCard.update({
            where: { id: cardExistente.id },
            data: { descricao: String(body.observacao || "").trim() },
          });
        }
      } else if (cardExistente && cardExistente.status === "PENDENTE") {
        await prisma.hkManagerialFailureCard.delete({ where: { id: cardExistente.id } });
      }
    }

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
