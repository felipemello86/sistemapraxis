import { NextResponse } from "next/server";
import { getSession, prisma } from "@praxis/core";
import { dataAtualSP } from "@/lib/timezone";

// Portado de apps/housekeeping/src/app/api/atribuicoes/solicitacoes/route.ts
// (v1) — sem o caminho de token, só sessão. Lista solicitações de troca
// pendentes do dia, pra governanta aprovar/rejeitar.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Leitura sempre liberada, mesmo sem acesso ao módulo (ver comentário em
  // apps/maintenance/src/app/page.tsx) — esta rota é só de leitura.
  const hoje = dataAtualSP();

  const solicitacoes = await prisma.dailyAssignment.findMany({
    where: { tenantId: session.tenantId, data: hoje, solicitacaoStatus: "PENDENTE" },
    select: {
      id: true,
      data: true,
      solicitacaoMensagem: true,
      solicitacaoTipo: true,
      solicitacaoFotos: true,
      uh: { select: { numero: true } },
      camareira: { select: { nome: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(solicitacoes);
}
