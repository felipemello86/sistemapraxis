"use server";

import { revalidatePath } from "next/cache";
import { prisma, getSession, hasModuleAccess } from "@praxis/core";

// Ações de gestão de regras customizadas (AiCustomRule). Toda regra nasce
// active: false (ver chat/tools.ts, propor_regra) — ativar é sempre uma
// ação humana explícita feita aqui, nunca automática. Mesmo padrão do
// resto do gateway (tenantSlug pré-vinculado via .bind).

async function requireAccess() {
  const session = await getSession();
  if (!session) throw new Error("Não autenticado.");
  const pode = await hasModuleAccess(session, "INTELLIGENCE");
  if (!pode) throw new Error("Sem acesso à Central de Inteligência.");
  return session;
}

async function getRegraOrThrow(id: string, tenantId: string) {
  const regra = await prisma.aiCustomRule.findUnique({ where: { id } });
  if (!regra || regra.tenantId !== tenantId) throw new Error("Regra não encontrada.");
  return regra;
}

export async function ativarRegraAction(tenantSlug: string, ruleId: string) {
  const session = await requireAccess();
  await getRegraOrThrow(ruleId, session.tenantId);
  await prisma.aiCustomRule.update({ where: { id: ruleId }, data: { active: true } });
  revalidatePath(`/${tenantSlug}/inteligencia/regras`);
}

export async function desativarRegraAction(tenantSlug: string, ruleId: string) {
  const session = await requireAccess();
  await getRegraOrThrow(ruleId, session.tenantId);
  await prisma.aiCustomRule.update({ where: { id: ruleId }, data: { active: false } });
  revalidatePath(`/${tenantSlug}/inteligencia/regras`);
}

export async function excluirRegraAction(tenantSlug: string, ruleId: string) {
  const session = await requireAccess();
  await getRegraOrThrow(ruleId, session.tenantId);
  await prisma.aiCustomRule.delete({ where: { id: ruleId } });
  revalidatePath(`/${tenantSlug}/inteligencia/regras`);
}
