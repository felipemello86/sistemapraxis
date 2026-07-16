"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma, getSession, clearSessionCookie, setSessionCookie } from "@praxis/core";

export type LoginResult = { ok: true } | { ok: false; error: string };

// Único ponto de entrada de login da suíte inteira (mesma decisão da v1) —
// autentica contra prisma.user (escopado ao tenant do slug da URL) e emite
// a sessão única. Não existe "sessão por módulo" nesta v2 — qualquer app
// futuro do monorepo só lê getSession().
export async function loginAction(
  clienteSlug: string,
  _prevState: LoginResult | null,
  formData: FormData
): Promise<LoginResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");

  if (!email || !senha) {
    return { ok: false, error: "Informe e-mail e senha." };
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: clienteSlug } });
  if (!tenant) return { ok: false, error: "Cliente não encontrado." };

  const user = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email } },
  });

  if (!user || !user.ativo || !user.passwordHash) {
    return { ok: false, error: "E-mail ou senha incorretos." };
  }

  const confere = await bcrypt.compare(senha, user.passwordHash);
  if (!confere) return { ok: false, error: "E-mail ou senha incorretos." };

  const access = await prisma.userModuleAccess.findMany({
    where: { userId: user.id, enabled: true },
    select: { module: true },
  });

  await setSessionCookie({
    userId: user.id,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    nome: user.nome,
    email: user.email,
    role: user.role,
    modules: access.map((a) => a.module),
  });

  redirect(`/${clienteSlug}`);
}

export async function logoutAction(clienteSlug: string) {
  await clearSessionCookie();
  redirect(`/${clienteSlug}`);
}

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

export async function changePasswordAction(
  _prevState: ChangePasswordResult | null,
  formData: FormData
): Promise<ChangePasswordResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sessão expirada. Entre de novo." };

  const senhaAtual = String(formData.get("senhaAtual") ?? "");
  const novaSenha = String(formData.get("novaSenha") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  if (novaSenha.length < 6) {
    return { ok: false, error: "A nova senha precisa ter pelo menos 6 caracteres." };
  }
  if (novaSenha !== confirmacao) {
    return { ok: false, error: "A confirmação não bate com a nova senha." };
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return { ok: false, error: "Usuário não encontrado." };

  if (user.passwordHash) {
    const confere = await bcrypt.compare(senhaAtual, user.passwordHash);
    if (!confere) return { ok: false, error: "Senha atual incorreta." };
  }

  const novoHash = await bcrypt.hash(novaSenha, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: novoHash } });

  return { ok: true };
}
