import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, notificarPorRoles, prisma } from "@praxis/core";

// Tela de Decisão de Bloqueio — pedido explícito do Felipe: "vamos remover o
// bloqueio automático para manutenção [...] cabe ao Atendimento decidir".
// Uma NC urgente já não bloqueia mais a UH sozinha (ver
// packages/core/src/maintenanceUrgente.ts) — só cria um HkBlockRequest
// PENDENTE. Esta rota lista os pedidos pendentes + as UHs atualmente
// bloqueadas, e decide (bloquear ou não) um pedido.
//
// ATENDIMENTO tem as mesmas permissões de GERENTE aqui, mesmo padrão usado
// em selecao-uhs/route.ts e atribuicoes/route.ts. GOVERNANTA é notificada
// (junto com Gerente/Atendimento/Master, ver aplicarBloqueioPorUrgencia) mas
// não decide — decisão explícita do Felipe ("cabe ao Atendimento decidir").
// Remover um bloqueio já aplicado continua pela ação "desbloquear" de
// /api/selecao-uhs (não duplicada aqui), que já inclui Governanta —
// mudança pedida por Felipe em outra ocasião e não afetada por este pedido.
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

  const [pendentes, bloqueadas] = await Promise.all([
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
  ]);

  return NextResponse.json({
    podeDecidir: onlyManagerOrMaster(session.role),
    pendentes: pendentes.map((r) => ({
      id: r.id,
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
  });
}

// PATCH /api/decisao-bloqueio — ação: decidir (requestId, bloquear: boolean)
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

  const { action, requestId, bloquear } = await req.json();

  if (action === "decidir") {
    const pedido = await prisma.hkBlockRequest.findUnique({ where: { id: requestId } });
    if (!pedido || pedido.tenantId !== tenantId) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }
    if (pedido.status !== "PENDENTE") {
      return NextResponse.json({ error: "Este pedido já foi decidido" }, { status: 400 });
    }

    const novoStatus = bloquear ? "BLOQUEADO" : "NAO_BLOQUEADO";

    // Decide junto qualquer outro pedido pendente pra mesma UH — evita que
    // um segundo card fique esquecido pendente depois da decisão.
    await prisma.hkBlockRequest.updateMany({
      where: { tenantId, uhId: pedido.uhId, status: "PENDENTE" },
      data: {
        status: novoStatus,
        decididoPorId: session.userId,
        decididoPorNome: session.nome,
        decididoEm: new Date(),
      },
    });

    const uh = await prisma.uH.findUnique({ where: { id: pedido.uhId }, select: { numero: true, bloqueada: true } });
    if (!uh) return NextResponse.json({ error: "UH não encontrada" }, { status: 404 });

    if (bloquear && !uh.bloqueada) {
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
