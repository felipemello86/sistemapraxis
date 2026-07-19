import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@praxis/core";

// Não pode ser `export`: arquivos route.ts do Next só aceitam exports de
// handlers/config — qualquer outro export quebra o build ("is not a valid
// Route export field"). O PedidoFlow tem a própria cópia desta lista.
const HORARIOS_VALIDOS = ["07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00"];

// POST /api/publico/confirmar — ÚNICA rota sem sessão da v2 (fora o GET da
// página, que é server component). A credencial é o token do link enviado
// ao hóspede: sem token válido, nada acontece; com token, só é possível
// confirmar/editar O PRÓPRIO pedido, nunca ler ou tocar outros dados.
export async function POST(req: NextRequest) {
  const { token, itens, observacoes, horarioEntrega } = await req.json();

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "token obrigatório" }, { status: 400 });
  }

  const pedido = await prisma.breakfastOrder.findUnique({
    where: { token },
    include: { itens: true },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

  // Depois que a cozinha começou a preparar, o hóspede não edita mais.
  if (!["LINK_ENVIADO", "RECEBIDO"].includes(pedido.status)) {
    return NextResponse.json({ error: "Este pedido já está em preparação e não pode mais ser alterado." }, { status: 400 });
  }

  if (!HORARIOS_VALIDOS.includes(horarioEntrega)) {
    return NextResponse.json({ error: "Horário de entrega inválido" }, { status: 400 });
  }
  if (!Array.isArray(itens) || itens.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos um item" }, { status: 400 });
  }

  // Valida itens contra o cardápio ativo do tenant e os limites por seção
  // (single = limiteSingle da seção; double = 2x).
  const menuItems = await prisma.menuItem.findMany({
    where: { tenantId: pedido.tenantId, ativo: true, section: { ativo: true } },
    include: { section: { select: { id: true, limiteSingle: true, nome: true } } },
  });
  const porId = new Map(menuItems.map((m) => [m.id, m]));
  const multiplicador = pedido.tipo === "DOUBLE" ? 2 : 1;

  const porSecao = new Map<string, number>();
  const itensValidados: { menuItemId: string; quantidade: number }[] = [];
  for (const raw of itens) {
    const menuItem = porId.get(raw?.menuItemId);
    const quantidade = Math.floor(Number(raw?.quantidade));
    if (!menuItem || !Number.isFinite(quantidade) || quantidade < 1) {
      return NextResponse.json({ error: "Item inválido no pedido" }, { status: 400 });
    }
    porSecao.set(menuItem.section.id, (porSecao.get(menuItem.section.id) ?? 0) + quantidade);
    itensValidados.push({ menuItemId: menuItem.id, quantidade });
  }
  for (const [secaoId, total] of porSecao) {
    const secao = menuItems.find((m) => m.section.id === secaoId)!.section;
    const limite = secao.limiteSingle * multiplicador;
    if (total > limite) {
      return NextResponse.json(
        { error: `A seção ${secao.nome} permite no máximo ${limite} item(ns) pro seu café.` },
        { status: 400 },
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.breakfastOrderItem.deleteMany({ where: { orderId: pedido.id } });
    await tx.breakfastOrderItem.createMany({
      data: itensValidados.map((i) => ({ orderId: pedido.id, ...i })),
    });
    await tx.breakfastOrder.update({
      where: { id: pedido.id },
      data: {
        status: "RECEBIDO",
        observacoes: typeof observacoes === "string" && observacoes.trim() ? observacoes.trim() : null,
        horarioEntrega,
        confirmadoEm: pedido.confirmadoEm ?? new Date(),
      },
    });
  });

  return NextResponse.json({ ok: true });
}
