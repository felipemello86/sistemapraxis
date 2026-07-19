import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";
import { podeGerenciar, podeOperarKanban } from "@/lib/permissions";

const KANBAN_STATUSES = ["RECEBIDO", "PREPARACAO", "ENTREGA", "FINALIZADO"] as const;
type KanbanStatus = (typeof KANBAN_STATUSES)[number];

// GET /api/pedidos?escopo=kanban|links
//   kanban → pedidos confirmados de hoje (RECEBIDO..FINALIZADO)
//   links  → links gerados recentes (inclui LINK_ENVIADO ainda não confirmado)
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "RESTAURANT"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const escopo = req.nextUrl.searchParams.get("escopo") || "kanban";

  if (escopo === "links") {
    const pedidos = await prisma.breakfastOrder.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { itens: { include: { menuItem: { select: { nome: true } } } } },
    });
    return NextResponse.json(pedidos);
  }

  // Kanban: só pedidos confirmados. FINALIZADO fica visível até o fim do
  // dia (não some na hora, pra cozinha conferir o que já saiu).
  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);

  const pedidos = await prisma.breakfastOrder.findMany({
    where: {
      tenantId: session.tenantId,
      status: { in: [...KANBAN_STATUSES] },
      OR: [
        { status: { in: ["RECEBIDO", "PREPARACAO", "ENTREGA"] } },
        { status: "FINALIZADO", updatedAt: { gte: inicioDoDia } },
      ],
    },
    orderBy: [{ horarioEntrega: "asc" }, { confirmadoEm: "asc" }],
    include: {
      itens: {
        include: { menuItem: { select: { nome: true, section: { select: { nome: true } } } } },
      },
    },
  });

  return NextResponse.json(pedidos);
}

// POST /api/pedidos — Atendimento/Gerente gera o link do hóspede
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "RESTAURANT"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  if (!podeGerenciar(session.role)) {
    return NextResponse.json({ error: "Sem permissão pra gerar links" }, { status: 403 });
  }

  const { clienteNome, uhNumero, tipo } = await req.json();
  if (!clienteNome?.trim() || !uhNumero?.trim() || !["SINGLE", "DOUBLE"].includes(tipo)) {
    return NextResponse.json({ error: "clienteNome, uhNumero e tipo (SINGLE|DOUBLE) são obrigatórios" }, { status: 400 });
  }

  const token = randomBytes(24).toString("base64url");

  const pedido = await prisma.breakfastOrder.create({
    data: {
      tenantId: session.tenantId,
      token,
      clienteNome: clienteNome.trim(),
      uhNumero: uhNumero.trim(),
      tipo,
      status: "LINK_ENVIADO",
      criadoPorNome: session.nome,
    },
  });

  return NextResponse.json(pedido, { status: 201 });
}

// PATCH /api/pedidos — mover cartão no kanban (requer atributo cozinha ou gestão)
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "RESTAURANT"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  if (!(await podeOperarKanban(session.userId, session.role))) {
    return NextResponse.json({ error: "Apenas usuários com atributo Cozinha operam o kanban" }, { status: 403 });
  }

  const { id, status } = await req.json();
  if (!id || !KANBAN_STATUSES.includes(status as KanbanStatus)) {
    return NextResponse.json({ error: "id e status válido são obrigatórios" }, { status: 400 });
  }

  const pedido = await prisma.breakfastOrder.findUnique({
    where: { id },
    include: { itens: { include: { menuItem: true } } },
  });
  if (!pedido || pedido.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }
  if (pedido.status === "LINK_ENVIADO") {
    return NextResponse.json({ error: "Pedido ainda não confirmado pelo hóspede" }, { status: 400 });
  }

  // Baixa de estoque: UMA vez, na entrada em FINALIZADO (pedido entregue).
  // estoqueBaixadoEm impede dupla baixa se o cartão for movido pra frente
  // e pra trás.
  const precisaBaixarEstoque = status === "FINALIZADO" && !pedido.estoqueBaixadoEm;

  if (precisaBaixarEstoque) {
    await prisma.$transaction(async (tx) => {
      for (const item of pedido.itens) {
        const saida = item.quantidade * item.menuItem.quantidadePorPorcao;
        await tx.stockMovement.create({
          data: {
            tenantId: session.tenantId,
            productId: item.menuItem.stockProductId,
            tipo: "SAIDA",
            quantidade: saida,
            usuarioId: session.userId,
            usuarioNome: session.nome,
            observacao: `Restaurante — café da manhã UH ${pedido.uhNumero} (${pedido.clienteNome})`,
          },
        });
        await tx.stockProduct.update({
          where: { id: item.menuItem.stockProductId },
          data: { quantidade: { decrement: saida } },
        });
      }
      await tx.breakfastOrder.update({
        where: { id },
        data: { status, estoqueBaixadoEm: new Date() },
      });
    });
  } else {
    await prisma.breakfastOrder.update({ where: { id }, data: { status } });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/pedidos?id=xxx — cancelar link/pedido não finalizado
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "RESTAURANT"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  if (!podeGerenciar(session.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const pedido = await prisma.breakfastOrder.findUnique({ where: { id } });
  if (!pedido || pedido.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }
  if (pedido.estoqueBaixadoEm) {
    return NextResponse.json({ error: "Pedido finalizado com baixa de estoque não pode ser excluído" }, { status: 400 });
  }

  await prisma.breakfastOrder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
