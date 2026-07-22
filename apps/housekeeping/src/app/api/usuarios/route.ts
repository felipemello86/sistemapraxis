import { NextResponse } from "next/server";
import { getSession, prisma } from "@praxis/core";

// Diferente da v1 (que tinha /api/usuarios-locais separado de /api/usuarios
// por causa da duplicação User local vs suite_core — bug real que causava
// atribuição falhando por FK inválida, ver histórico), aqui existe só UM
// User por pessoa (schema único v2). Este endpoint lista as pessoas do
// tenant pra popular selects de camareira/governanta nas telas de gestão.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Leitura sempre liberada, mesmo sem acesso ao módulo (ver comentário em
  // apps/maintenance/src/app/page.tsx) — esta rota é só de leitura.

  const users = await prisma.user.findMany({
    where: { tenantId: session.tenantId, ativo: true },
    orderBy: [{ role: "asc" }, { nome: "asc" }],
    select: { id: true, nome: true, role: true, telegramChatId: true, email: true, foto: true },
  });

  return NextResponse.json(users);
}
