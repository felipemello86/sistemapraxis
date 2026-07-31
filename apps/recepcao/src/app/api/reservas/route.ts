import { NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// GET /api/reservas — lista as reservas do tenant, mais próximas primeiro.
// Fase 1 do plano (praxis-pms-channel-manager-plano.md): só leitura — sem
// POST/PATCH/DELETE ainda (criação/edição manual é escopo de uma próxima
// versão desta tela). Cobre tanto reserva importada da Channex quanto
// qualquer uma criada direto no banco.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "RECEPTION"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const reservas = await prisma.reserva.findMany({
    where: { tenantId: session.tenantId },
    orderBy: [{ checkInData: "asc" }, { createdAt: "desc" }],
    include: {
      hospede: { select: { nome: true, email: true, telefone: true } },
      uh: { select: { numero: true, tipo: true } },
    },
    take: 200,
  });

  return NextResponse.json(reservas);
}
