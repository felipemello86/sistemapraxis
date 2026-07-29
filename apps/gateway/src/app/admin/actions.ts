"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import {
  prisma,
  createTenant,
  getAdminSession,
  requireAdminSession,
  setAdminSessionCookie,
  clearAdminSessionCookie,
  setSessionCookie,
  criarLinkDeCheckout,
  criarLinkDePortal,
  type SuiteModule,
} from "@praxis/core";

export type AdminActionResult = { ok: true } | { ok: false; error: string };

// Login do painel admin — completamente separado do login de tenant (ver
// [cliente]/actions.ts). PlatformAdmin não tem tenantId; a checagem é só
// contra a tabela PlatformAdmin.
export async function loginAdminAction(
  _prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");

  if (!email || !senha) return { ok: false, error: "Informe e-mail e senha." };

  const admin = await prisma.platformAdmin.findUnique({ where: { email } });
  if (!admin || !admin.ativo) return { ok: false, error: "E-mail ou senha incorretos." };

  const confere = await bcrypt.compare(senha, admin.passwordHash);
  if (!confere) return { ok: false, error: "E-mail ou senha incorretos." };

  await setAdminSessionCookie({ adminId: admin.id, nome: admin.nome, email: admin.email });
  redirect("/admin");
}

export async function logoutAdminAction() {
  await clearAdminSessionCookie();
  redirect("/admin/login");
}

export type CriarClienteResult = { ok: true; slug: string } | { ok: false; error: string };

export async function criarClienteAction(
  _prevState: CriarClienteResult | null,
  formData: FormData
): Promise<CriarClienteResult> {
  const admin = await getAdminSession();
  if (!admin) return { ok: false, error: "Sessão de admin expirada. Entre de novo." };

  const nome = String(formData.get("nome") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");
  const nomeUsuario = String(formData.get("nomeUsuario") ?? "").trim() || undefined;
  const modules = formData.getAll("modules").map(String) as SuiteModule[];

  if (!nome || !slug) return { ok: false, error: "Nome e slug são obrigatórios." };
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { ok: false, error: "Slug só pode ter letras minúsculas, números e hífen." };
  }
  if (!email || !senha) return { ok: false, error: "E-mail e senha do usuário MASTER são obrigatórios." };
  if (senha.length < 6) return { ok: false, error: "A senha precisa ter pelo menos 6 caracteres." };

  const existente = await prisma.tenant.findUnique({ where: { slug } });
  if (existente) return { ok: false, error: "Já existe um cliente com esse slug." };

  await createTenant({ nome, slug, email, senha, nomeUsuario, modules });

  redirect("/admin");
}

/**
 * "Acessar o sistema do cliente" — emite uma sessão de TENANT normal (a
 * mesma que o usuário MASTER teria após um login de verdade), marcada com
 * viaAdmin: true só pra exibir o aviso visual no hub. Decisão explícita do
 * Felipe: entrar como o MASTER do cliente, não uma visão separada.
 */
export async function impersonarAction(tenantId: string) {
  await requireAdminSession(); // lança e aborta se não houver sessão de admin válida

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error("Cliente não encontrado.");

  const master = await prisma.user.findFirst({
    where: { tenantId, role: "MASTER" },
    orderBy: { createdAt: "asc" },
  });
  if (!master) throw new Error("Este cliente não tem nenhum usuário MASTER cadastrado.");

  const access = await prisma.userModuleAccess.findMany({
    where: { userId: master.id, enabled: true },
    select: { module: true },
  });

  await setSessionCookie({
    userId: master.id,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    nome: master.nome,
    email: master.email,
    role: master.role,
    modules: access.map((a) => a.module),
    viaAdmin: true,
  });

  redirect(`/${tenant.slug}`);
}

export type CheckoutResult = { ok: true; url: string } | { ok: false; error: string };

export async function gerarLinkCheckoutAction(
  _prevState: CheckoutResult | null,
  formData: FormData
): Promise<CheckoutResult> {
  const admin = await getAdminSession();
  if (!admin) return { ok: false, error: "Sessão de admin expirada. Entre de novo." };

  const tenantId = String(formData.get("tenantId") ?? "");
  const planId = String(formData.get("planId") ?? "");
  if (!tenantId || !planId) return { ok: false, error: "Selecione um plano." };

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { ok: false, error: "Cliente não encontrado." };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://sistemaspraxis.com.br";

  try {
    const url = await criarLinkDeCheckout({
      tenantId,
      planId,
      successUrl: `${appUrl}/admin/clientes/${tenantId}?checkout=sucesso`,
      cancelUrl: `${appUrl}/admin/clientes/${tenantId}?checkout=cancelado`,
    });
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao gerar o link de checkout." };
  }
}

export async function gerarLinkPortalAction(
  _prevState: CheckoutResult | null,
  formData: FormData
): Promise<CheckoutResult> {
  const admin = await getAdminSession();
  if (!admin) return { ok: false, error: "Sessão de admin expirada. Entre de novo." };

  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return { ok: false, error: "Cliente inválido." };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://sistemaspraxis.com.br";

  try {
    const url = await criarLinkDePortal({ tenantId, returnUrl: `${appUrl}/admin/clientes/${tenantId}` });
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao gerar o link do portal." };
  }
}

export async function criarPlanoAction(
  _prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const admin = await getAdminSession();
  if (!admin) return { ok: false, error: "Sessão de admin expirada. Entre de novo." };

  const nome = String(formData.get("nome") ?? "").trim();
  const stripePriceId = String(formData.get("stripePriceId") ?? "").trim();
  const valorReais = String(formData.get("valorReais") ?? "").trim();
  const intervalo = String(formData.get("intervalo") ?? "MONTH");

  if (!nome || !stripePriceId || !valorReais) {
    return { ok: false, error: "Preencha nome, Price ID do Stripe e valor." };
  }

  const valorCentavos = Math.round(parseFloat(valorReais.replace(",", ".")) * 100);
  if (!Number.isFinite(valorCentavos) || valorCentavos <= 0) {
    return { ok: false, error: "Valor inválido." };
  }

  if (!stripePriceId.startsWith("price_")) {
    return {
      ok: false,
      error: "Isso parece um Product ID (prod_...). Cole o Price ID (price_...) — dentro do produto no Stripe, na seção de preços.",
    };
  }

  const jaExiste = await prisma.subscriptionPlan.findUnique({ where: { stripePriceId } });
  if (jaExiste) return { ok: false, error: "Já existe um plano com esse Price ID." };

  await prisma.subscriptionPlan.create({
    data: { nome, stripePriceId, valorCentavos, intervalo },
  });

  redirect("/admin");
}

export async function atualizarPlanoAction(
  planId: string,
  _prevState: AdminActionResult | null,
  formData: FormData
): Promise<AdminActionResult> {
  const admin = await getAdminSession();
  if (!admin) return { ok: false, error: "Sessão de admin expirada. Entre de novo." };

  const nome = String(formData.get("nome") ?? "").trim();
  const stripePriceId = String(formData.get("stripePriceId") ?? "").trim();
  const valorReais = String(formData.get("valorReais") ?? "").trim();
  const intervalo = String(formData.get("intervalo") ?? "MONTH");

  if (!nome || !stripePriceId || !valorReais) {
    return { ok: false, error: "Preencha nome, Price ID do Stripe e valor." };
  }
  if (!stripePriceId.startsWith("price_")) {
    return {
      ok: false,
      error: "Isso parece um Product ID (prod_...). Cole o Price ID (price_...) — dentro do produto no Stripe, na seção de preços.",
    };
  }

  const valorCentavos = Math.round(parseFloat(valorReais.replace(",", ".")) * 100);
  if (!Number.isFinite(valorCentavos) || valorCentavos <= 0) {
    return { ok: false, error: "Valor inválido." };
  }

  const conflito = await prisma.subscriptionPlan.findUnique({ where: { stripePriceId } });
  if (conflito && conflito.id !== planId) {
    return { ok: false, error: "Já existe outro plano com esse Price ID." };
  }

  await prisma.subscriptionPlan.update({
    where: { id: planId },
    data: { nome, stripePriceId, valorCentavos, intervalo },
  });

  redirect("/admin");
}

// "Excluir" é soft-delete (ativo: false) em vez de apagar a linha — planos já
// referenciados por uma TenantSubscription (planId) não podem ser apagados de
// verdade sem quebrar a FK, e mesmo os que não têm assinatura nenhuma ainda
// ficam mais seguros assim: histórico preservado, só sai da lista de planos
// ativos/selecionáveis.
export async function excluirPlanoAction(planId: string) {
  await requireAdminSession();
  await prisma.subscriptionPlan.update({ where: { id: planId }, data: { ativo: false } });
  redirect("/admin");
}

// Marca/desmarca um pedido de demonstração (vindo da landing page pública,
// ver src/app/page.tsx + api/demo) como já atendido — só pra quem acompanha
// os pedidos saber o que já teve retorno. Não apaga nada: o histórico de
// contatos fica todo no banco.
export async function alternarLeadAtendidoAction(leadId: string) {
  await requireAdminSession();
  const lead = await prisma.demoLead.findUnique({ where: { id: leadId } });
  if (!lead) redirect("/admin");
  await prisma.demoLead.update({
    where: { id: leadId },
    data: { atendido: !lead.atendido, atendidoEm: lead.atendido ? null : new Date() },
  });
  redirect("/admin");
}
