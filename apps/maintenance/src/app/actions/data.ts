"use server";

import { revalidatePath } from "next/cache";
import { createCorrectionCardForItem, getSession, hasModuleAccess, prisma, resolveCorrectionCard } from "@praxis/core";
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
    // Só usado quando status = NAO_CONFORME e o item NÃO tem uma não
    // conformidade já em aberto (ver comentário mais abaixo sobre
    // "carryover") — pedido explícito: toda não conformidade NOVA precisa
    // informar se vai precisar de material e/ou de serviço externo.
    needsMaterial?: boolean;
    needsExternalService?: boolean;
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
    include: { items: true },
  });

  // Uma inspeção completa sempre cria linhas novas de MaintenanceInspectionItem
  // (nunca reaproveita a antiga) — então, quando um item CONTINUA não
  // conforme entre uma inspeção e outra (pré-preenchido a partir da última
  // pendência, ver InspecaoWizard), a linha nova não pode gerar um SEGUNDO
  // card de Correção duplicado por cima do que já está em andamento no
  // kanban. Só cria card novo pra quem realmente é NÃO CONFORME pela
  // primeira vez (sem nenhum card em aberto ainda pra essa UH+item).
  const itensNaoConformes = input.itens.filter((it) => it.status === "NAO_CONFORME");
  if (itensNaoConformes.length > 0) {
    const checklistIds = itensNaoConformes.map((it) => it.checklistItemId);

    const cardsJaAbertos = await prisma.maintenanceCorrectionCard.findMany({
      where: {
        uhId: input.uhId,
        checklistItemId: { in: checklistIds },
        inspectionItem: { status: "NAO_CONFORME" },
        // Exclui os itens recém-criados nesta própria inspeção (nenhum card
        // ainda existe pra eles nesse ponto, então isso é só defensivo).
        inspectionItemId: { notIn: insp.items.map((it) => it.id) },
      },
      select: { checklistItemId: true },
    });
    const jaTemCardAberto = new Set(cardsJaAbertos.map((c) => c.checklistItemId));

    const itemCriadoPorChecklistId = new Map(insp.items.map((it) => [it.checklistItemId, it.id]));

    for (const it of itensNaoConformes) {
      if (jaTemCardAberto.has(it.checklistItemId)) continue; // carryover — já tem card cuidando
      const inspectionItemId = itemCriadoPorChecklistId.get(it.checklistItemId);
      if (!inspectionItemId) continue;
      if (typeof it.needsMaterial !== "boolean" || typeof it.needsExternalService !== "boolean") {
        throw new Error(
          "Informe se cada não conformidade nova precisa de material e/ou de serviço externo.",
        );
      }
      await createCorrectionCardForItem({
        tenantId: session.tenantId,
        inspectionItemId,
        uhId: input.uhId,
        checklistItemId: it.checklistItemId,
        needsMaterial: it.needsMaterial,
        needsExternalService: it.needsExternalService,
        triagedById: session.userId,
      });
    }
  }

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

// Triagem manual — pra não conformidades registradas ANTES dessa
// funcionalidade existir (sem card de Correção ainda). Felipe optou por não
// ter uma tela de triagem retroativa dedicada: em vez disso, esse botão
// aparece na tela Informações, ao lado de qualquer item ainda NAO_CONFORME
// sem card, e cria o card na hora com as duas flags.
async function triarCorrecaoCardImpl(input: {
  inspectionItemId: string;
  needsMaterial: boolean;
  needsExternalService: boolean;
}) {
  const session = await requireModuleSession();

  const item = await prisma.maintenanceInspectionItem.findUnique({
    where: { id: input.inspectionItemId },
    include: { inspection: { select: { tenantId: true, uhId: true } }, correctionCard: true },
  });
  if (!item || item.inspection.tenantId !== session.tenantId) {
    throw new Error("Item de inspeção não encontrado.");
  }
  if (item.status !== "NAO_CONFORME") {
    throw new Error("Este item não está mais não conforme.");
  }
  if (item.correctionCard) {
    throw new Error("Este item já tem um card de Correção.");
  }

  await createCorrectionCardForItem({
    tenantId: session.tenantId,
    inspectionItemId: item.id,
    uhId: item.inspection.uhId,
    checklistItemId: item.checklistItemId,
    needsMaterial: input.needsMaterial,
    needsExternalService: input.needsExternalService,
    triagedById: session.userId,
  });

  revalidatePath("/");
}
export const triarCorrecaoCardAction = safeAction(triarCorrecaoCardImpl);

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

// "Item incompatível" — usado direto na Rota de Inspeção quando o inspetor
// se depara com um item do checklist que não se aplica àquela UH (falha de
// cadastro). Reaproveita a mesma tabela/transação de setAtribuicaoUnidadeImpl
// acima, só que calculando a lista nova a partir do estado atual (catálogo
// inteiro, se a UH ainda não tem customização — ou a lista customizada já
// existente) menos o item removido, em vez de receber a lista pronta do
// client (evita depender do client ter o snapshot de atribuições
// atualizado numa sessão de inspeção longa).
async function removerItemIncompativelImpl(input: { uhId: string; checklistItemId: string }) {
  const session = await requireModuleSession();

  const uh = await prisma.uH.findUnique({ where: { id: input.uhId }, select: { tenantId: true } });
  if (!uh || uh.tenantId !== session.tenantId) throw new Error("Unidade não encontrada.");

  const [catalogo, atuais] = await Promise.all([
    prisma.maintenanceChecklistItem.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true },
    }),
    prisma.maintenanceUnitChecklistItem.findMany({
      where: { uhId: input.uhId, tenantId: session.tenantId },
      select: { checklistItemId: true },
    }),
  ]);

  // Sem linha nenhuma pra essa UH ainda = todos os itens do catálogo se
  // aplicam por padrão (ver comentário no schema) — a base pra remover é o
  // catálogo inteiro nesse caso. Se já existe uma lista customizada,
  // parte dela.
  const baseIds = atuais.length > 0 ? atuais.map((a) => a.checklistItemId) : catalogo.map((c) => c.id);
  const novaLista = baseIds.filter((id) => id !== input.checklistItemId);

  // Lista vazia viraria "todos os itens se aplicam" de novo (ver mesmo
  // comentário) — o oposto do que o inspetor quis dizer ao remover o
  // último item. Bloqueia esse caso raro em vez de produzir esse estado
  // errado silenciosamente.
  if (novaLista.length === 0) {
    throw new Error(
      "Não é possível remover: seria o último item da UH, e isso reativaria todos os itens do catálogo por padrão. Ajuste em Configurações se essa UH realmente não usa nenhum item.",
    );
  }

  await prisma.$transaction([
    prisma.maintenanceUnitChecklistItem.deleteMany({
      where: { uhId: input.uhId, tenantId: session.tenantId },
    }),
    prisma.maintenanceUnitChecklistItem.createMany({
      data: novaLista.map((checklistItemId) => ({
        tenantId: session.tenantId,
        uhId: input.uhId,
        checklistItemId,
      })),
    }),
  ]);

  revalidatePath("/");
}
export const removerItemIncompativelAction = safeAction(removerItemIncompativelImpl);

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

/* -------------------------------- UH 3D ------------------------------------ */
// Tela imersiva por cômodo (porta/quarto/cozinha/banheiro) com spots de
// verificação sobrepostos às fotos — ver comentário no schema Prisma
// (model MaintenanceUhImage/MaintenanceUhSpot). Cadastro é por UH
// individual, feito na aba "UH 3D" de Configurações.

// Cria uma nova foto pro cômodo — não é mais upsert único por (uhId, tipo):
// um cômodo pode ter várias fotos (ver migration que removeu o @@unique).
// Ordem de exibição é sempre createdAt asc, então cada nova foto entra no
// final da lista daquele cômodo.
async function salvarUhImagemImpl(input: { uhId: string; tipo: string; imageUrl: string }) {
  const session = await requireModuleSession();

  const uh = await prisma.uH.findUnique({ where: { id: input.uhId }, select: { tenantId: true } });
  if (!uh || uh.tenantId !== session.tenantId) throw new Error("Unidade não encontrada.");

  const img = await prisma.maintenanceUhImage.create({
    data: {
      tenantId: session.tenantId,
      uhId: input.uhId,
      tipo: input.tipo,
      imageUrl: input.imageUrl,
    },
  });

  revalidatePath("/");
  return img.id;
}
export const salvarUhImagemAction = safeAction(salvarUhImagemImpl);

async function deleteUhImagemImpl(id: string) {
  const session = await requireModuleSession();
  // Cascade no schema já apaga os spots dessa imagem junto.
  await prisma.maintenanceUhImage.deleteMany({
    where: { id, tenantId: session.tenantId },
  });
  revalidatePath("/");
}
export const deleteUhImagemAction = safeAction(deleteUhImagemImpl);

async function createUhSpotImpl(input: { imageId: string; checklistItemId: string; x: number; y: number }) {
  const session = await requireModuleSession();

  const img = await prisma.maintenanceUhImage.findUnique({
    where: { id: input.imageId },
    select: { tenantId: true },
  });
  if (!img || img.tenantId !== session.tenantId) throw new Error("Imagem não encontrada.");

  const x = Math.min(100, Math.max(0, input.x));
  const y = Math.min(100, Math.max(0, input.y));

  const spot = await prisma.maintenanceUhSpot.create({
    data: {
      tenantId: session.tenantId,
      imageId: input.imageId,
      checklistItemId: input.checklistItemId,
      x,
      y,
    },
  });

  revalidatePath("/");
  return spot.id;
}
export const createUhSpotAction = safeAction(createUhSpotImpl);

async function updateUhSpotImpl(id: string, input: { x: number; y: number }) {
  const session = await requireModuleSession();
  await prisma.maintenanceUhSpot.updateMany({
    where: { id, tenantId: session.tenantId },
    data: {
      x: Math.min(100, Math.max(0, input.x)),
      y: Math.min(100, Math.max(0, input.y)),
    },
  });
  revalidatePath("/");
}
export const updateUhSpotAction = safeAction(updateUhSpotImpl);

async function deleteUhSpotImpl(id: string) {
  const session = await requireModuleSession();
  await prisma.maintenanceUhSpot.deleteMany({
    where: { id, tenantId: session.tenantId },
  });
  revalidatePath("/");
}
export const deleteUhSpotAction = safeAction(deleteUhSpotImpl);

// Edição de conformidade a partir de um clique no spot, na tela imersiva.
// Direção NAO_CONFORME → CONFORME reaproveita o mesmo registro de
// MaintenanceCorrection da Rota de Correção (mantém o histórico consistente
// entre as duas telas). Direção CONFORME → NAO_CONFORME não tem
// equivalente hoje (é "marcar como quebrado" na hora, fora do fluxo normal
// de inspeção) — atualiza o item direto, exigindo descrição da falha.
async function editarSpotInspecaoImpl(input: {
  inspectionItemId: string;
  status: "CONFORME" | "NAO_CONFORME";
  comment?: string;
  photos?: string[];
  // Só usado quando esse clique está REGISTRANDO uma não conformidade nova
  // (CONFORME → NAO_CONFORME) — se o item já estava NAO_CONFORME e isso é só
  // edição de descrição/fotos, o card de Correção já existe e não muda.
  needsMaterial?: boolean;
  needsExternalService?: boolean;
}) {
  const session = await requireModuleSession();

  const item = await prisma.maintenanceInspectionItem.findUnique({
    where: { id: input.inspectionItemId },
    include: { inspection: { select: { tenantId: true, uhId: true } } },
  });
  if (!item || item.inspection.tenantId !== session.tenantId) {
    throw new Error("Item de inspeção não encontrado.");
  }

  const comment = input.comment?.trim() || "";
  if (input.status === "NAO_CONFORME" && comment.length < 5) {
    throw new Error("Descreva a não conformidade (mínimo 5 caracteres).");
  }
  if (
    input.status === "NAO_CONFORME" &&
    item.status === "CONFORME" &&
    (typeof input.needsMaterial !== "boolean" || typeof input.needsExternalService !== "boolean")
  ) {
    throw new Error("Informe se essa não conformidade precisa de material e/ou de serviço externo.");
  }

  const now = new Date();

  if (input.status === "CONFORME" && item.status === "NAO_CONFORME") {
    // Mesma transação da Rota de Correção — gera histórico.
    await prisma.$transaction([
      prisma.maintenanceCorrection.create({
        data: {
          tenantId: session.tenantId,
          inspectionItemId: item.id,
          uhId: item.inspection.uhId,
          checklistItemId: item.checklistItemId,
          authorId: session.userId,
          description: comment || "Corrigido via UH 3D.",
          photos: JSON.stringify(input.photos ?? []),
          createdAt: now,
        },
      }),
      prisma.maintenanceInspectionItem.update({
        where: { id: item.id },
        data: { status: "CONFORME", corrigidoEm: now, comment: null, photos: "[]" },
      }),
    ]);
  } else {
    // NAO_CONFORME → NAO_CONFORME (editar descrição/fotos) ou
    // CONFORME → NAO_CONFORME (marcar como quebrado agora).
    const eraNovoRegistro = input.status === "NAO_CONFORME" && item.status === "CONFORME";

    await prisma.maintenanceInspectionItem.update({
      where: { id: item.id },
      data: {
        status: input.status,
        comment: input.status === "NAO_CONFORME" ? comment : null,
        photos: input.status === "NAO_CONFORME" ? JSON.stringify(input.photos ?? []) : "[]",
        corrigidoEm: input.status === "CONFORME" ? now : null,
      },
    });

    if (eraNovoRegistro) {
      await createCorrectionCardForItem({
        tenantId: session.tenantId,
        inspectionItemId: item.id,
        uhId: item.inspection.uhId,
        checklistItemId: item.checklistItemId,
        needsMaterial: input.needsMaterial as boolean,
        needsExternalService: input.needsExternalService as boolean,
        triagedById: session.userId,
      });
    }
  }

  revalidatePath("/");
}
export const editarSpotInspecaoAction = safeAction(editarSpotInspecaoImpl);

/* ------------------------ Informações do item (IV-UH) -------------------- */
// Dado cadastral livre por UH x item de checklist (ex.: ar-condicionado →
// potência, fabricante, serial). Editável em UH 3D e nas telas de item não
// conforme (Inspeções, Rota de Correção) — ver comentário no schema Prisma
// (model MaintenanceItemInfo). Toda alteração real (valor mudou de fato)
// gera uma linha em MaintenanceItemInfoLog, nunca apagada.
async function salvarInfoItemImpl(input: {
  uhId: string;
  checklistItemId: string;
  info: string;
  photos: string[];
}) {
  const session = await requireModuleSession();

  const uh = await prisma.uH.findUnique({ where: { id: input.uhId }, select: { tenantId: true } });
  if (!uh || uh.tenantId !== session.tenantId) throw new Error("Unidade não encontrada.");

  const item = await prisma.maintenanceChecklistItem.findUnique({
    where: { id: input.checklistItemId },
    select: { tenantId: true },
  });
  if (!item || item.tenantId !== session.tenantId) throw new Error("Item de checklist não encontrado.");

  const novoInfo = input.info.trim() || null;
  const novasFotos = JSON.stringify(input.photos ?? []);

  const atual = await prisma.maintenanceItemInfo.findUnique({
    where: { uhId_checklistItemId: { uhId: input.uhId, checklistItemId: input.checklistItemId } },
  });

  const fotosAtuais = atual?.photos ?? "[]";

  // Sem mudança real — não grava, não gera log à toa.
  if ((atual?.info ?? null) === novoInfo && fotosAtuais === novasFotos) return atual?.id ?? null;

  const registro = await prisma.maintenanceItemInfo.upsert({
    where: { uhId_checklistItemId: { uhId: input.uhId, checklistItemId: input.checklistItemId } },
    create: {
      tenantId: session.tenantId,
      uhId: input.uhId,
      checklistItemId: input.checklistItemId,
      info: novoInfo,
      photos: novasFotos,
      updatedById: session.userId,
    },
    update: {
      info: novoInfo,
      photos: novasFotos,
      updatedById: session.userId,
    },
  });

  await prisma.maintenanceItemInfoLog.create({
    data: {
      tenantId: session.tenantId,
      itemInfoId: registro.id,
      uhId: input.uhId,
      checklistItemId: input.checklistItemId,
      previousInfo: atual?.info ?? null,
      newInfo: novoInfo,
      previousPhotos: fotosAtuais,
      newPhotos: novasFotos,
      authorId: session.userId,
    },
  });

  revalidatePath("/");
  return registro.id;
}
export const salvarInfoItemAction = safeAction(salvarInfoItemImpl);
