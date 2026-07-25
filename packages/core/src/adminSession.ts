/**
 * Sessão do painel admin da Praxis — deliberadamente SEPARADA da sessão de
 * tenant (ver session.ts). PlatformAdmin não tem tenantId (não é usuário de
 * nenhum cliente, é staff da própria Praxis), então não faz sentido nenhum
 * misturar os dois: cookie diferente (praxis_admin_session), payload
 * diferente, nenhuma rota de tenant aceita isso e vice-versa. Mesma técnica
 * (JWT assinado em cookie httpOnly) e mesma lib (jose) do session.ts, só que
 * com sua própria "fonte de verdade".
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const ADMIN_SESSION_COOKIE = "praxis_admin_session";
const ADMIN_SESSION_TTL = "12h"; // mais curta que a sessão de tenant (30d) — acesso administrativo, mais sensível
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function getSecret() {
  // Reaproveita o mesmo SESSION_SECRET do resto da suíte — é só a chave de
  // assinatura HMAC, não há necessidade de uma segunda variável de ambiente
  // só pra isso (o cookie diferente já isola os dois espaços de sessão).
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET não configurado. Defina uma string aleatória longa nas env vars."
    );
  }
  return new TextEncoder().encode(secret);
}

export interface AdminSessionPayload {
  adminId: string;
  nome: string;
  email: string;
}

export async function signAdminSession(payload: AdminSessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ADMIN_SESSION_TTL)
    .sign(getSecret());
}

export async function verifyAdminSession(token: string): Promise<AdminSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as AdminSessionPayload;
  } catch {
    return null;
  }
}

export async function getAdminSession(): Promise<AdminSessionPayload | null> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyAdminSession(token);
}

/** Igual a getAdminSession(), mas lança se não houver sessão válida. */
export async function requireAdminSession(): Promise<AdminSessionPayload> {
  const session = await getAdminSession();
  if (!session) throw new Error("UNAUTHENTICATED_ADMIN");
  return session;
}

export async function setAdminSessionCookie(payload: AdminSessionPayload) {
  const token = await signAdminSession(payload);
  (await cookies()).set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearAdminSessionCookie() {
  (await cookies()).delete({ path: "/", name: ADMIN_SESSION_COOKIE });
}
