import "server-only";
import { getSession as coreGetSession, hasModuleAccess, type SessionPayload } from "@praxis/core";

// Substitui apps/booking-reviews/src/lib/auth.ts (v1) — lá era um JWT local
// próprio deste app (cookie "session") + upsert de um User duplicado a cada
// login. Aqui é só uma casca fina sobre a sessão única do @praxis/core:
// sem cookie próprio, sem User local, sem upsert. `requireRole(...)`
// continua com a mesma assinatura (checa nome do papel, ex: "MASTER"/
// "GERENTE") pra minimizar mudança nas Server Actions portadas.
//
// `SessionPayload` re-exportado de @praxis/core tem os campos userId/
// tenantId/tenantSlug/nome/email/role/modules — different dos nomes do v1
// (session.name → session.nome, session.companyId não existe mais, usa
// session.tenantId direto).

export { getSession } from "@praxis/core";
export type { SessionPayload };

export async function requireSession(): Promise<SessionPayload> {
  const session = await coreGetSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  const podeAcessar = await hasModuleAccess(session, "BOOKING_REVIEWS");
  if (!podeAcessar) throw new Error("FORBIDDEN");
  return session;
}

export async function requireRole(...roles: string[]): Promise<SessionPayload> {
  const session = await requireSession();
  if (!roles.includes(session.role)) throw new Error("FORBIDDEN");
  return session;
}
