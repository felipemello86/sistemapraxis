import { NextRequest, NextResponse } from "next/server";
import { prisma, getSession } from "@praxis/core";
import { bloqueadoParaGerenciarCadastros } from "@/lib/auth-guard";

// Cadastro de Propriedades (agrupamento de UHs — ex: "Bnb Flex Suites",
// "Bnb Flex Comfort", "Bnb Flex Premium"). Mora aqui no gateway, junto do
// cadastro de UHs, pelo mesmo motivo: um cadastro só, válido em qualquer
// módulo. Nasceu especificamente porque Avaliações (Booking/Airbnb) só
// identifica a propriedade/anúncio na notificação, nunca a UH específica —
// então toda UH precisa apontar pra uma Property (ver UH.propertyId no
// schema). CRUD mínimo por enquanto: listar, criar, e editar latitude/
// longitude (renomear/excluir fica pra quando surgir necessidade real).
//
// latitude/longitude alimentam o georreferenciamento da Governança (ver
// POST /api/geo/checkin no housekeeping) — são opcionais de propósito, sem
// coordenada cadastrada o check-in de chegada simplesmente não roda pra essa
// property.

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sessão expirada" }, { status: 401 });

  const properties = await prisma.property.findMany({
    where: { tenantId: session.tenantId },
    select: {
      id: true,
      nome: true,
      latitude: true,
      longitude: true,
      _count: { select: { uhs: { where: { ativo: true } } } },
    },
    orderBy: { nome: "asc" },
  });
  return NextResponse.json(properties);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const bloqueado = bloqueadoParaGerenciarCadastros(session);
  if (bloqueado) return bloqueado;

  const { nome } = await req.json();
  const trimmed = (nome ?? "").trim();
  if (!trimmed) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });

  try {
    const property = await prisma.property.create({
      data: { tenantId: session!.tenantId, nome: trimmed },
    });
    return NextResponse.json(property, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Propriedade já existe" }, { status: 409 });
  }
}

// PATCH aceita nome e/ou latitude+longitude, cada um só é tocado se vier no
// corpo (checagem "in body", não desestruturação direta) — assim o form de
// renomear (só manda nome) não pisa nas coordenadas já salvas, e o form de
// coordenadas (só manda latitude/longitude) não pisa no nome. null explícito
// em latitude/longitude limpa a coordenada (volta a desativar o check-in de
// geo pra essa property) — não vale pra nome, que é sempre obrigatório.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  const bloqueado = bloqueadoParaGerenciarCadastros(session);
  if (bloqueado) return bloqueado;

  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const data: { nome?: string; latitude?: number | null; longitude?: number | null } = {};

  if ("nome" in body) {
    const trimmed = (body.nome ?? "").trim();
    if (!trimmed) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
    data.nome = trimmed;
  }

  if ("latitude" in body || "longitude" in body) {
    const { latitude, longitude } = body;
    if (
      (latitude !== null && (typeof latitude !== "number" || Number.isNaN(latitude))) ||
      (longitude !== null && (typeof longitude !== "number" || Number.isNaN(longitude)))
    ) {
      return NextResponse.json({ error: "Coordenadas inválidas" }, { status: 400 });
    }
    data.latitude = latitude;
    data.longitude = longitude;
  }

  try {
    const property = await prisma.property.updateMany({
      where: { id, tenantId: session!.tenantId },
      data,
    });
    if (property.count === 0) {
      return NextResponse.json({ error: "Propriedade não encontrada" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Já existe uma propriedade com esse nome" }, { status: 409 });
  }
}

// Exclusão bloqueada se ainda houver UH ou Review apontando pra essa
// property — nas duas relações o FK é obrigatório sem onDelete: Cascade no
// schema (ver ChannexRoomMapping/UH/Review), então um DELETE direto quebraria
// com erro cru do Postgres; aqui devolve uma mensagem que explica o que
// fazer antes. GeoArrival tem onDelete: Cascade (é só um registro de
// check-in por GPS, ok perder junto).
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  const bloqueado = bloqueadoParaGerenciarCadastros(session);
  if (bloqueado) return bloqueado;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const [uhsCount, reviewsCount] = await Promise.all([
    prisma.uH.count({ where: { propertyId: id, tenantId: session!.tenantId } }),
    prisma.review.count({ where: { propertyId: id, tenantId: session!.tenantId } }),
  ]);
  if (uhsCount > 0) {
    return NextResponse.json(
      { error: `Essa propriedade ainda tem ${uhsCount} UH(s) cadastrada(s). Mova ou exclua as UHs antes.` },
      { status: 409 }
    );
  }
  if (reviewsCount > 0) {
    return NextResponse.json(
      { error: `Essa propriedade ainda tem ${reviewsCount} avaliação(ões) associada(s) — não pode ser excluída.` },
      { status: 409 }
    );
  }

  const result = await prisma.property.deleteMany({ where: { id, tenantId: session!.tenantId } });
  if (result.count === 0) {
    return NextResponse.json({ error: "Propriedade não encontrada" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
