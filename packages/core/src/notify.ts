import { prisma } from "./prisma";
import { sendPushToUser } from "./push";

// Promovido de apps/maintenance/src/lib/dailyReport.ts pra @praxis/core —
// precisa ser chamado tanto do módulo de Manutenção (Resultado Diário, NC
// urgente) quanto do módulo de Governança (NC urgente registrada pela
// camareira/governanta), que antes duplicava esse mesmo padrão inline em
// vários arquivos (apps/housekeeping/src/app/api/bloqueio/route.ts,
// finalizacao-dia/route.ts, falha-lavanderia/route.ts). Esses arquivos
// antigos continuam com a duplicação própria (baixo risco mexer neles sem
// necessidade); só o código novo usa esta versão compartilhada.

export async function notificarTodosDoTenant(
  tenantId: string,
  payload: { title: string; body: string; data?: Record<string, string> },
) {
  const usuarios = await prisma.user.findMany({
    where: { tenantId, ativo: true },
    select: { id: true },
  });
  for (const u of usuarios) {
    await sendPushToUser(u.id, payload);
  }
}

export async function notificarPorRoles(
  tenantId: string,
  roles: string[],
  payload: { title: string; body: string; data?: Record<string, string> },
) {
  const usuarios = await prisma.user.findMany({
    where: { tenantId, ativo: true, role: { in: roles } },
    select: { id: true },
  });
  for (const u of usuarios) {
    await sendPushToUser(u.id, payload);
  }
}
