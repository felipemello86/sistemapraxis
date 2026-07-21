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
  itens: {
    checklistItemId: string;
    status: "CONFORME" | "NAO_CONFORME";
    comment?: string;
    photos?: string[]; // URLs já hospedadas no Cloudinary (ver /api/upload)
  }[];
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
          photos: JSON.stringify(it.photos ?? []),
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

/* ------------------------------- Correções -------------------------------- */
// Rota de Correção — recuperada do protótipo standalone "Bnb Manutenção"
// (REGISTER_CORRECAO / PageCorrecao). Fecha uma não-conformidade registrada
// numa inspeção: grava o histórico (MaintenanceCorrection) e devolve o item
// pra CONFORME.

async function createCorrecaoImpl(input: {
  inspectionItemId: string;
  description: string;
  photos?: string[];
}) {
  const session = await requireModuleSession();

  const description = input.description.trim();
  if (description.length < 5) {
    throw new Error("Descreva o que foi corrigido (mínimo 5 caracteres).");
  }

  const item = await prisma.maintenanceInspectionItem.findUnique({
    where: { id: input.inspectionItemId },
    include: { inspection: { select: { tenantId: true, uhId: true } } },
  });
  if (!item || item.inspection.tenantId !== session.tenantId) {
    throw new Error("Item de inspeção não encontrado.");
  }
  if (item.status !== "NAO_CONFORME") {
    throw new Error("Este item já está conforme.");
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.maintenanceCorrection.create({
      data: {
        tenantId: session.tenantId,
        inspectionItemId: item.id,
        uhId: item.inspection.uhId,
        checklistItemId: item.checklistItemId,
        authorId: session.userId,
        description,
        photos: JSON.stringify(input.photos ?? []),
        createdAt: now,
      },
    }),
    prisma.maintenanceInspectionItem.update({
      where: { id: item.id },
      data: { status: "CONFORME", corrigidoEm: now },
    }),
  ]);

  revalidatePath("/");
}
export const createCorrecaoAction = safeAction(createCorrecaoImpl);

/* --------------------- Atribuição de itens por UH -------------------------- */
// UH em si é cadastro central do gateway (ver comentário em
// components/views/configuracoes.tsx) — aqui só gerenciamos o dado que é
// específico da natureza "manutenção": quais itens do catálogo se aplicam a
// cada UH. Lista vazia = "todos os itens se aplicam" (ver schema Prisma).

async function setAtribuicaoUnidadeImpl(input: { uhId: string; checklistItemIds: string[] }) {
  const session = await requireModuleSession();

  const uh = await prisma.uH.findUnique({ where: { id: input.uhId }, select: { tenantId: true } });
  if (!uh || uh.tenantId !== session.tenantId) throw new Error("Unidade não encontrada.");

  await prisma.$transaction([
    prisma.maintenanceUnitChecklistItem.deleteMany({
      where: { uhId: input.uhId, tenantId: session.tenantId },
    }),
    ...(input.checklistItemIds.length > 0
      ? [
          prisma.maintenanceUnitChecklistItem.createMany({
            data: input.checklistItemIds.map((checklistItemId) => ({
              tenantId: session.tenantId,
              uhId: input.uhId,
              checklistItemId,
            })),
          }),
        ]
      : []),
  ]);

  revalidatePath("/");
}
export const setAtribuicaoUnidadeAction = safeAction(setAtribuicaoUnidadeImpl);

/* ------------------------------- Config ------------------------------------ */
// Prazo máximo entre inspeções e meta de conformidade — específicos da
// natureza "manutenção" (mesmo padrão de HkConfig em Governança).

async function updateConfigImpl(input: { maxDaysBetweenInspections: number; goal: number }) {
  const session = await requireModuleSession();

  if (input.maxDaysBetweenInspections < 1 || input.maxDaysBetweenInspections > 365) {
    throw new Error("Prazo deve estar entre 1 e 365 dias.");
  }
  if (input.goal < 0 || input.goal > 100) {
    throw new Error("Meta deve estar entre 0 e 100%.");
  }

  await prisma.maintenanceConfig.upsert({
    where: { tenantId: session.tenantId },
    create: {
      tenantId: session.tenantId,
      maxDaysBetweenInspections: input.maxDaysBetweenInspections,
      goal: input.goal,
    },
    update: {
      maxDaysBetweenInspections: input.maxDaysBetweenInspections,
      goal: input.goal,
    },
  });

  revalidatePath("/");
}
export const updateConfigAction = safeAction(updateConfigImpl);
