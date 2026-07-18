import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";
import { alertarEstoqueBaixo } from "@/lib/telegram";

function podeGerenciar(role: string) {
  return ["MASTER", "GERENTE", "GOVERNANTA"].includes(role);
}

// GET /api/movimentos?productId=&tipo=&limit=&offset=
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "STOCK"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const productId = req.nextUrl.searchParams.get("productId") || undefined;
  const tipo = req.nextUrl.searchParams.get("tipo") || undefined;
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 100, 500);
  const offset = Number(req.nextUrl.searchParams.get("offset")) || 0;

  const movimentos = await prisma.stockMovement.findMany({
    where: {
      tenantId: session.tenantId,
      ...(productId ? { productId } : {}),
      ...(tipo ? { tipo: tipo as "ENTRADA" | "SAIDA" } : {}),
    },
    include: { product: { select: { id: true, nome: true, unidade: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });

  return NextResponse.json(movimentos);
}

// POST /api/movimentos - registrar entrada/saída (atualiza o saldo do produto)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "STOCK"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  if (!podeGerenciar(session.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { productId, tipo, quantidade, observacao } = await req.json();
  if (!productId || !tipo || !quantidade) {
    return NextResponse.json({ error: "productId, tipo e quantidade são obrigatórios" }, { status: 400 });
  }
  if (!["ENTRADA", "SAIDA"].includes(tipo)) {
    return NextResponse.json({ error: "tipo inválido" }, { status: 400 });
  }
  const qtd = Number(quantidade);
  if (!qtd || qtd <= 0) {
    return NextResponse.json({ error: "quantidade deve ser maior que zero" }, { status: 400 });
  }

  const produto = await prisma.stockProduct.findUnique({ where: { id: productId } });
  if (!produto || produto.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  }

  const delta = tipo === "ENTRADA" ? qtd : -qtd;

  try {
    const [movimento, produtoAtualizado] = await prisma.$transaction([
      prisma.stockMovement.create({
        data: {
          tenantId: session.tenantId,
          productId,
          tipo,
          quantidade: qtd,
          usuarioId: session.userId,
          usuarioNome: session.nome,
          observacao: observacao?.trim() || null,
        },
      }),
      prisma.stockProduct.update({
        where: { id: productId },
        data: { quantidade: { increment: delta } },
      }),
    ]);

    // Alerta de estoque mínimo (best-effort, não bloqueia a resposta) — só
    // dispara na transição ENTRADA→abaixo (não tinha como acontecer) ou
    // SAIDA que empurrou o saldo pra baixo do mínimo, evitando notificar de
    // novo em toda saída subsequente enquanto já está baixo... na prática,
    // como não guardamos o estado anterior aqui, o alerta dispara sempre
    // que o saldo pós-movimentação estiver abaixo do mínimo — repetitivo se
    // ninguém repor, mas simples e sem estado extra pra rastrear.
    if (produtoAtualizado.quantidade <= produtoAtualizado.estoqueMinimo) {
      void (async () => {
        const destinatarios = await prisma.user.findMany({
          where: { tenantId: session.tenantId, role: { in: ["MASTER", "GERENTE", "GOVERNANTA"] } },
          select: { telegramChatId: true },
        });
        void alertarEstoqueBaixo({
          destinatarios,
          produtoNome: produtoAtualizado.nome,
          quantidade: produtoAtualizado.quantidade,
          unidade: produtoAtualizado.unidade,
          estoqueMinimo: produtoAtualizado.estoqueMinimo,
        });
      })();
    }

    return NextResponse.json({ movimento, produto: produtoAtualizado }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
