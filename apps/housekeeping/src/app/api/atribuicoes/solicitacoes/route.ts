import { NextResponse } from "next/server";
import { format } from "date-fns";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Portado de apps/housekeeping/src/app/api/atribuicoes/solicitacoes/route.ts
// (v1) — sem o caminho de token, só sessão. Lista solicitações de troca
// pendentes do dia, pra governanta aprovar/rejeitar.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  const hoje = format(new Date(), "yyyy-MM-dd");

  const solicitacoes = await prisma.dailyAssignment.findMany({
    where: { tenantId: session.tenantId, data: hoje, solicitacaoStatus: "PENDENTE" },
    select: {
      id: true,
      data: true,
      solicitacaoMensagem: true,
      uh: { select: { numero: true } },
      camareira: { select: { nome: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(solicitacoes);
}
