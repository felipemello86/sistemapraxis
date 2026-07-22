import { NextResponse } from "next/server";
import { getSession, prisma } from "@praxis/core";

// Só leitura — o cadastro (criar/editar/desativar UH) mudou pro gateway
// (apps/gateway/src/app/api/uhs/route.ts), mesmo padrão já usado pra
// Usuários: um cadastro central, válido pra Governança, Manutenção e
// Avaliações, em vez de cada módulo ter sua própria cópia com id próprio.
// Esta rota continua existindo só porque várias telas internas do
// housekeeping (SelecaoView, AtribuicaoView, etc.) precisam da lista de UHs
// com os campos operacionais de Governança (status, emManutencao,
// bloqueada) que o cadastro central do gateway não expõe.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Leitura sempre liberada, mesmo sem acesso ao módulo (ver comentário em
  // apps/maintenance/src/app/page.tsx) — esta rota é só de leitura.

  const uhs = await prisma.uH.findMany({
    where: { tenantId: session.tenantId, ativo: true },
    orderBy: { ordem: "asc" },
  });
  return NextResponse.json(uhs);
}
