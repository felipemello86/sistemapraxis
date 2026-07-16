import { NextRequest, NextResponse } from "next/server";
import { prisma, getSession } from "@praxis/core";

// Versão MÍNIMA, portada só o suficiente pra tela "Minhas UHs" funcionar —
// no v1 (apps/housekeeping/src/app/api/atribuicoes/route.ts) este arquivo
// também tem GET (lista da governanta), POST (criar atribuição) e a ação
// "decidir_alteracao" (aprovar/rejeitar). Isso é trabalho da tela da
// governanta, que é a próxima fatia a portar — ainda não existe aqui.

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (body.action === "solicitar_alteracao") {
    const { assignmentId, mensagem } = body;

    const assignment = await prisma.dailyAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment || assignment.tenantId !== session.tenantId) {
      return NextResponse.json({ error: "Atribuição não encontrada" }, { status: 404 });
    }

    await prisma.dailyAssignment.update({
      where: { id: assignmentId },
      data: { solicitacaoMensagem: mensagem, solicitacaoStatus: "PENDENTE" },
    });

    // TODO: notificar governantas via Telegram com link pra aprovar/rejeitar,
    // quando o bot for portado, e quando a tela da governanta existir.

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação não implementada nesta fatia" }, { status: 400 });
}
