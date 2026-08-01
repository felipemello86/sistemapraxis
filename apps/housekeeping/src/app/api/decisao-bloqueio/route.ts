import { NextRequest, NextResponse } from "next/server";
import { ativarManutencaoUH, emitEvent, getSession, hasModuleAccess, notificarPorRoles, prisma } from "@praxis/core";

// Tela de Decisão de Bloqueio — pedido explícito do Felipe: "vamos remover o
// bloqueio automático para manutenção [...] cabe ao Atendimento decidir".
// Uma NC urgente já não bloqueia mais a UH sozinha (ver
// packages/core/src/maintenanceUrgente.ts) — só cria um HkBlockRequest
// PENDENTE. O mesmo padrão foi estendido pra marcar uma UH "Em Manutenção"
// (ver comentário do model HkBlockRequest no schema) — decisão explícita do
// Felipe de reaproveitar esta tela em vez de criar uma nova só pra isso, daí
// o campo `tipo` (BLOQUEIO | MANUTENCAO) aparecer em tudo abaixo. Esta rota
// lista os pedidos pendentes dos dois tipos + o estado atual das UHs
// (bloqueadas e em manutenção), e decide (aprovar ou não) um pedido.
//
// ATENDIMENTO tem as mesmas permissões de GERENTE aqui, mesmo padrão usado
// em selecao-uhs/route.ts e atribuicoes/route.ts. GOVERNANTA é notificada
// (junto com Gerente/Atendimento/Master) mas não decide — decisão explícita
// do Felipe ("cabe ao Atendimento decidir"). Remover uma decisão já aplicada
// (desbloquear, ou encerrar manutenção) continua pelas ações
// "desbloquear"/"toggle_manutencao" (UH já em manutenção → desliga direto,
// sem aprovação) de /api/selecao-uhs — não duplicadas aqui.
function onlyManagerOrMaster(role: string) {
  return ["MASTER", "GERENTE", "ATENDIMENTO"].includes(role);
}

// GET /api/decisao-bloqueio
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Leitura liberada pra qualquer role do módulo — mesmo padrão do resto de
  // Governança (ver comentário em selecao-uhs/route.ts GET). O nav item já
  // fica restrito a quem tem motivo de ver essa tela (ver Sidebar.tsx).
  const tenantId = session.tenantId;

  const [pendentes, bloqueadas, emManutencao] = await Promise.all([
    prisma.hkBlockRequest.findMany({
      where: { tenantId, status: "PENDENTE" },
      include: { uh: { select: { numero: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.uH.findMany({
      where: { tenantId, bloqueada: true },
      select: {
        id: true,
        numero: true,
        bloqueioDescricao: true,
        bloqueioSolicitanteNome: true,
        bloqueioEm: true,
        bloqueioOrigem: true,
      },
      orderBy: { numero: "asc" },
    }),
    prisma.uH.findMany({
      where: { tenantId, emManutencao: true },
      select: {
        id: true,
        numero: true,
        manutencaoDescricao: true,
        manutencaoSolicitanteNome: true,
        manutencaoEm: true,
      },
      orderBy: { numero: "asc" },
    }),
  ]);

  return NextResponse.json({
    podeDecidir: onlyManagerOrMaster(session.role),
    pendentes: pendentes.map((r) => ({
      id: r.id,
      tipo: r.tipo,
      uhId: r.uhId,
      uhNumero: r.uh.numero,
      itemNome: r.itemNome,
      comment: r.comment,
      solicitanteNome: r.solicitanteNome,
      createdAt: r.createdAt,
    })),
    bloqueadas: bloqueadas.map((u) => ({
      uhId: u.id,
      numero: u.numero,
      bloqueioDescricao: u.bloqueioDescricao,
      bloqueioSolicitanteNome: u.bloqueioSolicitanteNome,
      bloqueioEm: u.bloqueioEm,
      bloqueioOrigem: u.bloqueioOrigem,
    })),
    emManutencao: emManutencao.map((u) => ({
      uhId: u.id,
      numero: u.numero,
      manutencaoDescricao: u.manutencaoDescricao,
      manutencaoSolicitanteNome: u.manutencaoSolicitanteNome,
      manutencaoEm: u.manutencaoEm,
    })),
  });
}

// PATCH /api/decisao-bloqueio — ação: decidir (requestId, aprovar: boolean)
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  if (!onlyManagerOrMaster(session.role)) {
    return NextResponse.json({ error: "Sem permissão — cabe ao Atendimento decidir" }, { status: 403 });
  }
  const tenantId = session.tenantId;

  const { action, requestId, aprovar } = await req.json();

  if (action === "decidir") {
    const pedido = await prisma.hkBlockRequest.findUnique({
      where: { id: requestId },
      include: { uh: { select: { numero: true } } },
    });
    if (!pedido || pedido.tenantId !== tenantId) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }
    if (pedido.status !== "PENDENTE") {
      return NextResponse.json({ error: "Este pedido já foi decidido" }, { status: 400 });
    }

    const novoStatus = aprovar ? "APROVADO" : "REJEITADO";

    // Decide junto qualquer outro pedido pendente pra mesma UH E mesmo tipo
    // — evita que um segundo card do mesmo tipo fique esquecido pendente
    // depois da decisão. Não mexe em pedidos do OUTRO tipo pra mesma UH
    // (uma UH pode ter, ao mesmo tempo, um pedido de bloqueio E um pedido de
    // manutenção pendentes — são decisões independentes).
    await prisma.hkBlockRequest.updateMany({
      where: { tenantId, uhId: pedido.uhId, status: "PENDENTE", tipo: pedido.tipo },
      data: {
        status: novoStatus,
        decididoPorId: session.userId,
        decididoPorNome: session.nome,
        decididoEm: new Date(),
      },
    });

    // O evento mais importante desta tela pro Felipe (motivou a própria
    // tela existir: NC urgente não bloqueia mais sozinha, precisa de decisão
    // humana explícita do Atendimento) — registra a decisão em si, pros dois
    // tipos (BLOQUEIO e MANUTENCAO), antes de qualquer efeito colateral.
    await emitEvent({
      tenantId,
      module: "HOUSEKEEPING",
      eventType: "housekeeping.log.bloqueio_decidido",
      entityType: "HkBlockRequest",
      entityId: requestId,
      payload: {
        uhNumero: pedido.uh.numero,
        tipo: pedido.tipo,
        aprovado: !!aprovar,
        itemNome: pedido.itemNome,
        comment: pedido.comment,
        solicitanteNome: pedido.solicitanteNome,
        atorNome: session.nome,
      },
    });

    // tipo === "MANUTENCAO" — NÃO CHAMADA ATUALMENTE. Desde que
    // api/selecao-uhs/toggle_manutencao voltou a chamar ativarManutencaoUH
    // direto (pedido explícito do Felipe: registro de manutenção não exige
    // mais aprovação), nada cria HkBlockRequest.tipo="MANUTENCAO" — esse
    // branch nunca mais deve receber um pedido PENDENTE por aqui. Deixado
    // por segurança (esse comportamento já foi revertido mais de uma vez) e
    // pra não deixar um pedido antigo eventualmente parado sem decisão.
    if (pedido.tipo === "MANUTENCAO") {
      if (aprovar) {
        if (!pedido.checklistItemId) {
          return NextResponse.json(
            { error: "Este pedido é anterior à exigência de item de checklist e não pode mais ser aprovado. Peça pra recriar a solicitação." },
            { status: 400 },
          );
        }
        await ativarManutencaoUH({
          tenantId,
          uhId: pedido.uhId,
          checklistItemId: pedido.checklistItemId,
          descricao: pedido.comment,
          solicitanteNome: pedido.solicitanteNome,
          registradoPorId: session.userId,
        });
      }
      return NextResponse.json({ ok: true });
    }

    // tipo === "BLOQUEIO" (comportamento original, só renomeado bloquear→aprovar)
    const uh = await prisma.uH.findUnique({ where: { id: pedido.uhId }, select: { numero: true, bloqueada: true } });
    if (!uh) return NextResponse.json({ error: "UH não encontrada" }, { status: 404 });

    if (aprovar && !uh.bloqueada) {
      await prisma.uH.update({
        where: { id: pedido.uhId },
        data: {
          bloqueada: true,
          bloqueioDescricao: pedido.comment,
          bloqueioSolicitanteNome: pedido.solicitanteNome,
          bloqueioEm: new Date(),
          bloqueioOrigem: "DECISAO_ATENDIMENTO",
        },
      });

      await notificarPorRoles(tenantId, ["GOVERNANTA", "GERENTE", "MASTER", "ATENDIMENTO"], {
        title: "🔒 UH bloqueada",
        body: `UH ${uh.numero} foi bloqueada pelo Atendimento (${session.nome}).`,
        data: { tipo: "bloqueio", uhId: pedido.uhId },
      });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
