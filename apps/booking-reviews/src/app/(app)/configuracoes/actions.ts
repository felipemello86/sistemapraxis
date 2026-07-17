"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@praxis/core";
import { requireRole } from "@/lib/auth";
import { safeAction } from "@/lib/safeAction";

// Portado de apps/booking-reviews/src/app/(app)/configuracoes/actions.ts (v1)
// — só a fatia que continua deste lado. Usuários e Propriedades saem daqui:
// cadastro único centralizado no gateway (apps/gateway/[cliente]/configuracoes/
// usuarios e /uhs), mesmo padrão já adotado em Governança — evita a
// duplicação de cadastro (id local vs suite_core) que causava bugs de FK no
// v1. Telegram idem: o gateway já tem um campo `telegramChatId` editável
// direto no cadastro do usuário (cadastro manual pelo Master), o que
// substitui o fluxo de vínculo por código do v1 (generateTelegramLinkCode +
// webhook) — não precisa ser portado.
//
// company.targetScore (v1) → prisma.reviewsConfig (model próprio no v2, ver
// schema); companyId → tenantId. Diferente do v1 (`update` simples, assumia
// que a linha sempre existia), aqui é `upsert` — nem todo tenant
// necessariamente já tem uma linha em ReviewsConfig quando a pessoa acessa
// esta tela pela primeira vez.
//
// Todas embrulhadas em safeAction (ver src/lib/safeAction.ts) — mesmo padrão
// do resto do módulo, pra mensagem de erro de validação chegar de verdade no
// cliente em vez do digest genérico do Next.js.

async function updateTargetScoreActionImpl(targetScore: number) {
  const session = await requireRole("MASTER");
  if (Number.isNaN(targetScore) || targetScore < 0 || targetScore > 5) {
    throw new Error("Informe um valor de meta entre 0 e 5.");
  }

  await prisma.reviewsConfig.upsert({
    where: { tenantId: session.tenantId },
    update: { targetScore },
    create: { tenantId: session.tenantId, targetScore },
  });

  revalidatePath("/configuracoes");
  revalidatePath("/dashboard");
}

async function createCategoryActionImpl(name: string) {
  const session = await requireRole("MASTER", "GERENTE");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Informe o nome da categoria.");

  const existing = await prisma.category.findFirst({
    where: { tenantId: session.tenantId, name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) throw new Error("Já existe uma categoria com esse nome.");

  await prisma.category.create({ data: { tenantId: session.tenantId, name: trimmed } });
  revalidatePath("/configuracoes");
}

async function toggleCategoryActiveActionImpl(categoryId: string, active: boolean) {
  const session = await requireRole("MASTER", "GERENTE");
  const category = await prisma.category.findFirstOrThrow({
    where: { id: categoryId, tenantId: session.tenantId },
  });
  await prisma.category.update({ where: { id: category.id }, data: { active } });
  revalidatePath("/configuracoes");
}

export async function updateTargetScoreAction(targetScore: number) {
  return safeAction(updateTargetScoreActionImpl)(targetScore);
}
export async function createCategoryAction(name: string) {
  return safeAction(createCategoryActionImpl)(name);
}
export async function toggleCategoryActiveAction(categoryId: string, active: boolean) {
  return safeAction(toggleCategoryActiveActionImpl)(categoryId, active);
}
