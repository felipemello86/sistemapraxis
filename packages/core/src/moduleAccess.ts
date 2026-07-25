import { prisma } from "./prisma";
import type { SessionPayload } from "./session";
import type { SuiteModule } from "../generated";

/**
 * Confere acesso a um módulo consultando o banco na hora, em vez de confiar
 * no array `modules` do JWT de sessão (que é calculado no login e pode ficar
 * desatualizado por até 30 dias — foi exatamente esse tipo de cache stale
 * que causou o bug de "módulo sumindo" na v1, onde o cookie compartilhado
 * só era re-emitido em pontos específicos do fluxo). Toda rota de módulo de
 * negócio deve checar por aqui, nunca só por `session.modules`.
 *
 * Regra de ouro (igual à v1): as DUAS condições precisam ser verdadeiras —
 * o tenant precisa ter o módulo contratado/habilitado E a pessoa precisa
 * ter acesso individual a ele.
 */
export async function hasModuleAccess(session: SessionPayload, module: SuiteModule): Promise<boolean> {
  const [tenantModule, userAccess] = await Promise.all([
    prisma.tenantModule.findUnique({
      where: { tenantId_module: { tenantId: session.tenantId, module } },
      select: { enabled: true },
    }),
    prisma.userModuleAccess.findUnique({
      where: { userId_module: { userId: session.userId, module } },
      select: { enabled: true },
    }),
  ]);

  return Boolean(tenantModule?.enabled && userAccess?.enabled);
}

/**
 * Lista todos os módulos que a pessoa pode acessar agora (mesma regra de
 * ouro de hasModuleAccess — tenant habilitado E acesso individual — só que
 * em lote, pra montar o dropdown "trocar de módulo" da sidebar sem uma
 * query por módulo). Também consulta o banco na hora, pelo mesmo motivo de
 * hasModuleAccess: session.modules (JWT) pode estar desatualizado.
 */
export async function getAccessibleModules(session: SessionPayload): Promise<SuiteModule[]> {
  const [tenantModules, userAccess] = await Promise.all([
    prisma.tenantModule.findMany({
      where: { tenantId: session.tenantId, enabled: true },
      select: { module: true },
    }),
    prisma.userModuleAccess.findMany({
      where: { userId: session.userId, enabled: true },
      select: { module: true },
    }),
  ]);

  const liberadosParaUsuario = new Set(userAccess.map((u) => u.module));
  return tenantModules.map((t) => t.module).filter((m) => liberadosParaUsuario.has(m));
}
