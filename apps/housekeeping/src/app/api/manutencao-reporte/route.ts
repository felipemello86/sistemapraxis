import { NextRequest, NextResponse } from "next/server";
import { createCorrectionCardForItem, prisma, getSession, hasModuleAccess } from "@praxis/core";

// POST /api/manutencao-reporte — etapa obrigatória "Necessidade de
// Manutenção?" da camareira (ver CamareiraView, fase "manutencao"), quando
// ela responde "Sim" e registra um item. Sensibiliza o módulo de Manutenção
// direto — mesmo banco/tenant (ver packages/core/prisma/schema.prisma),
// então é só um prisma.maintenanceInspection/maintenanceInspectionItem
// normal, sem chamada entre apps.
//
// Estratégia pra não "sombrear" outros itens já avaliados na UH: nunca cria
// uma inspeção nova se já existe uma pra essa UH — a mais recente é a
// referência de "estado atual" em todo o resto do módulo de Manutenção (ver
// ultimaInspecaoPorUnidade em apps/maintenance/src/lib/domain.ts; se
// criássemos uma inspeção nova só com este item, ela viraria "a mais
// recente" e todos os outros itens da UH pareceriam "nunca avaliados" nas
// telas de Manutenção). Em vez disso, atualiza/anexa um item nessa mesma
// inspeção. Só cria uma inspeção do zero quando a UH nunca teve nenhuma.
//
// Re-checa no servidor se o item já está NAO_CONFORME (mesma checagem que o
// client já fez com os dados de /api/sessoes, mas pode ter ficado
// desatualizada) — se sim, não grava nada e devolve jaRegistrado:true, pro
// client mostrar o aviso em vez de "salvo com sucesso".
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso a este módulo" }, { status: 403 });
  }

  const { uhId, checklistItemId, descricao, fotos, needsMaterial, needsExternalService } = await req.json();

  if (!uhId || !checklistItemId || !descricao || String(descricao).trim().length < 5) {
    return NextResponse.json({ error: "Descreva a falha detectada (mínimo 5 caracteres)." }, { status: 400 });
  }
  if (typeof needsMaterial !== "boolean" || typeof needsExternalService !== "boolean") {
    return NextResponse.json(
      { error: "Informe se precisa de material e de serviço externo." },
      { status: 400 },
    );
  }

  const uh = await prisma.uH.findUnique({ where: { id: uhId }, select: { tenantId: true } });
  if (!uh || uh.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Unidade não encontrada." }, { status: 404 });
  }

  const item = await prisma.maintenanceChecklistItem.findUnique({
    where: { id: checklistItemId },
    select: { tenantId: true },
  });
  if (!item || item.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Item de checklist não encontrado." }, { status: 404 });
  }

  const descricaoLimpa = String(descricao).trim();
  const fotosJson = JSON.stringify(Array.isArray(fotos) ? fotos : []);

  const ultima = await prisma.maintenanceInspection.findFirst({
    where: { tenantId: session.tenantId, uhId },
    orderBy: { date: "desc" },
    include: { items: true },
  });

  let inspectionItemId: string;

  if (ultima) {
    const itemAtual = ultima.items.find((it) => it.checklistItemId === checklistItemId);

    if (itemAtual?.status === "NAO_CONFORME") {
      return NextResponse.json({ ok: true, jaRegistrado: true });
    }

    if (itemAtual) {
      await prisma.maintenanceInspectionItem.update({
        where: { id: itemAtual.id },
        data: { status: "NAO_CONFORME", comment: descricaoLimpa, photos: fotosJson, corrigidoEm: null },
      });
      inspectionItemId = itemAtual.id;
    } else {
      const novoItem = await prisma.maintenanceInspectionItem.create({
        data: {
          inspectionId: ultima.id,
          checklistItemId,
          status: "NAO_CONFORME",
          comment: descricaoLimpa,
          photos: fotosJson,
        },
      });
      inspectionItemId = novoItem.id;
    }
  } else {
    const novaInspecao = await prisma.maintenanceInspection.create({
      data: {
        tenantId: session.tenantId,
        uhId,
        inspectorId: session.userId,
        date: new Date(),
        items: {
          create: [{ checklistItemId, status: "NAO_CONFORME", comment: descricaoLimpa, photos: fotosJson }],
        },
      },
      include: { items: true },
    });
    inspectionItemId = novaInspecao.items[0].id;
  }

  // Não conformidade nova (não é "jaRegistrado") — sempre precisa do card de
  // Correção com as duas flags respondidas (pedido explícito, mesmo
  // tratamento dos outros 3 pontos de entrada: inspeção completa e UH 3D).
  await createCorrectionCardForItem({
    tenantId: session.tenantId,
    inspectionItemId,
    uhId,
    checklistItemId,
    needsMaterial,
    needsExternalService,
    triagedById: session.userId,
  });

  return NextResponse.json({ ok: true, jaRegistrado: false });
}
