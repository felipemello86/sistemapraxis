import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Tela "Falhas Gerenciais" — kanban Pendências/Resolvido. Os cards são
// criados automaticamente em PATCH /api/inspecoes (ação avaliar_item),
// quando a Governanta marca como FALHA um item cuja natureza (definida em
// Configurações > Checklist de inspeção) é GERENCIAL — ver
// packages/core, model HkManagerialFailureCard. Esta rota só lista e
// resolve, não cria.

// GET - lista todos os cards do tenant (Pendências + Resolvido)
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Leitura liberada pra quem chega na rota — a tela já é escondida por
  // papel no menu (ver Sidebar.tsx); resolver fica restrito, ver PATCH.

  const cards = await prisma.hkManagerialFailureCard.findMany({
    where: { tenantId: session.tenantId },
    include: {
      uh: { select: { numero: true } },
      resolvedBy: { select: { nome: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    cards.map((c) => ({
      id: c.id,
      uhId: c.uhId,
      uhNumero: c.uh.numero,
      itemNome: c.itemNome,
      descricao: c.descricao,
      status: c.status,
      resolvedDescricao: c.resolvedDescricao,
      resolvedPhotos: JSON.parse(c.resolvedPhotos || "[]"),
      resolvedAt: c.resolvedAt,
      resolvedByNome: c.resolvedBy?.nome ?? null,
      createdAt: c.createdAt,
    })),
  );
}

// PATCH - action: resolver (descrição obrigatória, fotos opcionais)
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  // Pedido explícito do Felipe: só Governanta/Gerente/Master acompanham e
  // resolvem — camareira e demais papéis nem veem a tela (ver Sidebar.tsx).
  if (!["GOVERNANTA", "GERENTE", "MASTER"].includes(session.role)) {
    return NextResponse.json({ error: "Sem permissão pra resolver falhas gerenciais" }, { status: 403 });
  }

  const { action, cardId, resolvedDescricao, resolvedPhotos } = await req.json();

  if (action === "resolver") {
    const card = await prisma.hkManagerialFailureCard.findUnique({ where: { id: cardId } });
    if (!card) return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });
    if (card.tenantId !== session.tenantId) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    if (card.status === "RESOLVIDO") {
      return NextResponse.json({ error: "Esse card já foi resolvido." }, { status: 400 });
    }
    // Mesmo mínimo de 5 caracteres usado no fluxo equivalente da Manutenção
    // (ver executarCardExecucaoImpl em apps/maintenance/src/app/actions/correcao.ts).
    if (String(resolvedDescricao || "").trim().length < 5) {
      return NextResponse.json({ error: "Descreva a correção realizada (mínimo 5 caracteres)." }, { status: 400 });
    }

    const atualizado = await prisma.hkManagerialFailureCard.update({
      where: { id: cardId },
      data: {
        status: "RESOLVIDO",
        resolvedDescricao: String(resolvedDescricao).trim(),
        resolvedPhotos: JSON.stringify(Array.isArray(resolvedPhotos) ? resolvedPhotos : []),
        resolvedAt: new Date(),
        resolvedById: session.userId,
      },
    });
    return NextResponse.json(atualizado);
  }

  return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
}
