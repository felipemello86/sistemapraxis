"use server";

import { revalidatePath } from "next/cache";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";
import { safeAction } from "@/lib/safeAction";

// Portado de apps/maintenance/src/app/actions/data.ts (v1). Diferenças:
//   - accountId (schema antigo, multiSchema) virou tenantId da sessão v2.
//   - Sem Unidades/Usuários aqui — ver comentário no schema Prisma
//     (packages/core/prisma/schema.prisma, bloco MANUTENÇÃO) e em
//     components/views/configuracoes.tsx.
//   - itemLegacyId (Int solto) virou checklistItemId (FK real).
//   - Todas as actions passaram a devolver SafeActionResult (via
//     `safeAction`), mesmo padrão já usado em Avaliações/Reuniões — client
//     usa `unwrapSafeAction` pra recuperar a mensagem de erro real (Next.js
//     apaga mensagens de erro que atravessam a fronteira de Server Action em
//     produção, ver comentário em lib/safeAction.ts).

async function requireModuleSession() {
  const session = await getSession();
  if (!session) throw new Error("Não autenticado.");
  const podeAcessar = await hasModuleAccess(session, "MAINTENANCE");
  if (!podeAcessar) throw new Error("Sem acesso ao módulo Manutenção.");
  return session;
}

/* ---------------------------- Itens de catálogo -------------------------- */

async function createItemImpl(input: { name: string; category: string; subDescription?: string }) {
  const session = await requireModuleSession();
  await prisma.maintenanceChecklistItem.create({
    data: {
      tenantId: session.tenantId,
      name: input.name,
      category: input.category,
      subDescription: input.subDescription ?? null,
    },
  });
  revalidatePath("/");
}
export const createItemAction = safeAction(createItemImpl);

async function updateItemImpl(
  id: string,
  input: Partial<{ name: string; category: string; subDescription: string }>,
) {
  const session = await requireModuleSession();
  await prisma.maintenanceChecklistItem.updateMany({
    where: { id, tenantId: session.tenantId },
    data: input,
  });
  revalidatePath("/");
}
export const updateItemAction = safeAction(updateItemImpl);

async function deleteItemImpl(id: string) {
  const session = await requireModuleSession();
  await prisma.maintenanceChecklistItem.deleteMany({
    where: { id, tenantId: session.tenantId },
  });
  revalidatePath("/");
}
export const deleteItemAction = safeAction(deleteItemImpl);

/* ------------------------------ Inspeções -------------------------------- */

async function createInspecaoImpl(input: {
  uhId: string;
  inspectorId?: string;
  date?: string; // yyyy-mm-dd, default hoje
  itens: { checklistItemId: string; status: "CONFORME" | "NAO_CONFORME"; comment?: string }[];
}) {
  const session = await requireModuleSession();
  const date = input.date ? new Date(`${input.date}T00:00:00.000Z`) : new Date();
  const inspectorId = input.inspectorId ?? session.userId;

  const uh = await prisma.uH.findUnique({ where: { id: input.uhId }, select: { tenantId: true } });
  if (!uh || uh.tenantId !== session.tenantId) throw new Error("Unidade não encontrada.");

  const insp = await prisma.maintenanceInspection.create({
    data: {
      tenantId: session.tenantId,
      uhId: input.uhId,
      inspectorId,
      date,
      items: {
        create: input.itens.map((it) => ({
          checklistItemId: it.checklistItemId,
          status: it.status,
          comment: it.comment ?? null,
        })),
      },
    },
  });

  revalidatePath("/");
  return insp.id;
}
export const createInspecaoAction = safeAction(createInspecaoImpl);

async function deleteInspecaoImpl(id: string) {
  const session = await requireModuleSession();
  await prisma.maintenanceInspection.deleteMany({
    where: { id, tenantId: session.tenantId },
  });
  revalidatePath("/");
}
export const deleteInspecaoAction = safeAction(deleteInspecaoImpl);
