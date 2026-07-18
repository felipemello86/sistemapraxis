import { NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Espelha o Dashboard do sistema antigo (estoque-bnb-flex.onrender.com):
// 4 números-resumo + produtos em alerta + últimos movimentos. Diferença
// deliberada: "Status WhatsApp" virou "Status Telegram" (decisão explícita
// do Felipe de reconstruir o alerta com bot do Telegram em vez da Evolution
// API/WhatsApp do sistema antigo).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "STOCK"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  const tenantId = session.tenantId;

  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);

  const [totalProdutos, produtos, movimentosHoje, ultimosMovimentos] = await Promise.all([
    prisma.stockProduct.count({ where: { tenantId, ativo: true } }),
    prisma.stockProduct.findMany({
      where: { tenantId, ativo: true },
      select: { id: true, nome: true, categoria: true, unidade: true, quantidade: true, estoqueMinimo: true },
      orderBy: { nome: "asc" },
    }),
    prisma.stockMovement.count({ where: { tenantId, createdAt: { gte: inicioHoje } } }),
    prisma.stockMovement.findMany({
      where: { tenantId },
      include: { product: { select: { nome: true, unidade: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  // <= (não só <): sistema antigo considera "em alerta" também quando o
  // saldo está exatamente igual ao mínimo, não só abaixo dele.
  const emAlerta = produtos.filter((p) => p.quantidade <= p.estoqueMinimo);

  return NextResponse.json({
    totalProdutos,
    emAlerta: emAlerta.length,
    movimentosHoje,
    telegramConfigurado: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    produtosEmAlerta: emAlerta,
    ultimosMovimentos,
  });
}
