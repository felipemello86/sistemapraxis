import { prisma } from "@praxis/core";

// Quem pode gerar links de pedido (e administrar o cardápio):
// Atendimento tem as mesmas permissões de Gerente aqui (mesma decisão dos
// outros módulos onde Atendimento opera a rotina do dia).
export function podeGerenciar(role: string) {
  return ["MASTER", "GERENTE", "ATENDIMENTO"].includes(role);
}

// Quem pode operar o kanban (mover cartões): o atributo `cozinha` do
// cadastro de usuários habilita qualquer pessoa, independente do cargo;
// Master/Gerente/Atendimento também podem por serem gestão.
export async function podeOperarKanban(userId: string, role: string): Promise<boolean> {
  if (podeGerenciar(role)) return true;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { cozinha: true } });
  return user?.cozinha === true;
}
