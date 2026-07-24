"use server";

import { revalidatePath } from "next/cache";
import { prisma, getSession, hasModuleAccess } from "@praxis/core";

// Ações da Central de Inteligência — mesmo padrão do resto do gateway
// (ex.: logoutAction em [cliente]/actions.ts): primeiro argumento
// pré-vinculado via .bind(null, tenantSlug) na página, porque uma Server
// Action não sabe sozinha em qual rota do tenant foi chamada (precisa pra
// revalidatePath). Sem estado client-side: cada botão é um <form
// action={...}> que submete e recarrega a página server-rendered, seguindo
// a filosofia do resto deste app (gateway não usa React state/useTransition
// como os módulos de negócio — é deliberadamente a camada mais fina da
// suíte).

async function requireAccess() {
  const session = await getSession();
  if (!session) throw new Error("Não autenticado.");
  const pode = await hasModuleAccess(session, "INTELLIGENCE");
  if (!pode) throw new Error("Sem acesso à Central de Inteligência.");
  return session;
}

async function getInsightOrThrow(id: string, tenantId: string) {
  const insight = await prisma.aiInsight.findUnique({ where: { id } });
  if (!insight || insight.tenantId !== tenantId) throw new Error("Insight não encontrado.");
  return insight;
}

export async function marcarLidoAction(tenantSlug: string, insightId: string) {
  const session = await requireAccess();
  const insight = await getInsightOrThrow(insightId, session.tenantId);
  if (insight.status === "ABERTO") {
    await prisma.aiInsight.update({ where: { id: insightId }, data: { status: "LIDO" } });
  }
  revalidatePath(`/${tenantSlug}/inteligencia`);
}

export async function resolverInsightAction(tenantSlug: string, insightId: string) {
  const session = await requireAccess();
  await getInsightOrThrow(insightId, session.tenantId);
  await prisma.aiInsight.update({
    where: { id: insightId },
    data: { status: "RESOLVIDO", resolvedAt: new Date(), resolvedById: session.userId },
  });
  revalidatePath(`/${tenantSlug}/inteligencia`);
}

export async function descartarInsightAction(tenantSlug: string, insightId: string) {
  const session = await requireAccess();
  await getInsightOrThrow(insightId, session.tenantId);
  await prisma.aiInsight.update({
    where: { id: insightId },
    data: { status: "DESCARTADO", resolvedAt: new Date(), resolvedById: session.userId },
  });
  revalidatePath(`/${tenantSlug}/inteligencia`);
}
