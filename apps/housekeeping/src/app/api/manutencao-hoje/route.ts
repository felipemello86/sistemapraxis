import { NextRequest, NextResponse } from "next/server";
import { getSession, prisma } from "@praxis/core";

export const runtime = "nodejs";

// GET /api/manutencao-hoje?uhId=...&data=YYYY-MM-DD
//
// Alimenta o popup "Manutenção de hoje" (pedido explícito do Felipe,
// 04/08/2026): ao clicar na flag de Manutenção nas telas Seleção e
// Liberação / Atribuição Diária (Governança), o Atendimento precisa ver
// rapidamente o que está sendo feito de Manutenção naquela UH no dia — sem
// precisar entrar no módulo de Manutenção. Leitura cross-módulo direta via
// Prisma (banco único compartilhado, ver packages/core) — não vale a pena
// criar uma API pública dedicada no módulo Manutenção só pra este popup.
//
// Só entra aqui o que já está vinculado à programação FECHADA do dia
// (MaintenanceDailyCommitment + card com dailyCommitmentId, status
// PLANEJADA/EXECUTADA — ver fecharProgramacaoDiaImpl/adicionarCardUrgenteImpl
// em apps/maintenance/src/app/actions/correcao.ts). Cards ainda em "A Fazer"
// (sem commitment) não são "o que está sendo feito na UH hoje", são só
// pendências do backlog geral — não fazem parte da resposta.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = session.tenantId;

  const uhId = req.nextUrl.searchParams.get("uhId");
  const data = req.nextUrl.searchParams.get("data");
  if (!uhId || !data) {
    return NextResponse.json({ error: "uhId e data são obrigatórios" }, { status: 400 });
  }

  const commitment = await prisma.maintenanceDailyCommitment.findUnique({
    where: { tenantId_data: { tenantId, data } },
    select: { id: true },
  });

  const cards = commitment
    ? await prisma.maintenanceCorrectionCard.findMany({
        where: {
          tenantId,
          uhId,
          dailyCommitmentId: commitment.id,
          executionStatus: { in: ["PLANEJADA", "EXECUTADA"] },
        },
        include: {
          checklistItem: { select: { name: true, category: true } },
          inspectionItem: { select: { comment: true, urgente: true } },
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

  return NextResponse.json({
    // false = programação de Manutenção do dia ainda não foi fechada (ou
    // não existe pra essa data) — diferente de "programada mas sem cards
    // pra essa UH", que é `programado: true, cards: []`.
    programado: !!commitment,
    cards: cards.map((c) => ({
      id: c.id,
      itemNome: c.checklistItem?.name ?? "Item removido do catálogo",
      itemCategory: c.checklistItem?.category ?? null,
      comment: c.inspectionItem?.comment ?? null,
      urgente: c.inspectionItem?.urgente ?? false,
      executionStatus: c.executionStatus,
      executedAt: c.executedAt,
      canceladoPorLiberacao: c.canceladoPorLiberacao,
    })),
  });
}
