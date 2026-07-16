/**
 * Sessão única da suíte inteira.
 *
 * Diferença central em relação à v1: lá existiam DUAS sessões por app
 * satélite — uma sessão NextAuth local (própria de cada app) e o cookie
 * compartilhado (praxis_session), sincronizadas por uma "ponte" que
 * dessincronizava com frequência (foi a causa dos bugs de módulo
 * "desaparecendo" e de ids trocados). Aqui só existe UM cookie, UMA fonte
 * de verdade — qualquer app do monorepo (hoje só o gateway; amanhã os
 * módulos de negócio) chama getSession()/requireSession() direto, sem
 * reconstruir sessão nenhuma por conta própria.
 *
 * Nome do cookie ("praxis_v2_session") é deliberadamente diferente do
 * cookie da v1 ("praxis_session") — os dois sistemas podem coexistir
 * durante a reconstrução sem qualquer risco de um ler o cookie do outro.
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { SuiteModule } from "../generated";

const SESSION_COOKIE = "praxis_v2_session";
const SESSION_TTL = "30d";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET não configurado. Defina uma string aleatória longa nas env vars (ver apps/gateway/.env.example)."
    );
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  tenantId: string;
  tenantSlug: string;
  nome: string;
  email: string;
  role: string;
  modules: SuiteModule[]; // módulos habilitados pra essa pessoa neste tenant
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** Lê e valida a sessão da requisição atual (Server Component/Route Handler/Server Action). */
export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Igual a getSession(), mas lança se não houver sessão válida — usar em rotas que exigem login. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  return session;
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = await signSession(payload);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete({ path: "/", name: SESSION_COOKIE });
}
