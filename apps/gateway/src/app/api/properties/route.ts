import { NextRequest, NextResponse } from "next/server";
import { prisma, getSession } from "@praxis/core";
import { bloqueadoParaGerenciarCadastros } from "@/lib/auth-guard";

// Cadastro de Propriedades (agrupamento de UHs — ex: "Bnb Flex Suites",
// "Bnb Flex Comfort", "Bnb Flex Premium"). Mora aqui no gateway, junto do
// cadastro de UHs, pelo mesmo motivo: um cadastro só, válido em qualquer
// módulo. Nasceu especificamente porque Avaliações (Booking/Airbnb) só
// identifica a propriedade/anúncio na notificação, nunca a UH específica —
// então toda UH precisa apontar pra uma Property (ver UH.propertyId no
// schema). CRUD mínimo por enquanto: listar e criar (renomear/excluir fica
// pra quando surgir necessidade real).

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sessão expirada" }, { status: 401 });

  const properties = await prisma.property.findMany({
    where: { tenantId: session.tenantId },
    select: { id: true, nome: true, _count: { select: { uhs: true } } },
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
