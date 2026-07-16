import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Portado de apps/housekeeping/src/app/api/uhs/route.ts (v1). hotelId → tenantId.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const uhs = await prisma.uH.findMany({
    where: { tenantId: session.tenantId, ativo: true },
    orderBy: { ordem: "asc" },
  });
  return NextResponse.json(uhs);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { numero, tipo, ordem } = await req.json();
  if (!numero) return NextResponse.json({ error: "Número obrigatório" }, { status: 400 });

  try {
    const uh = await prisma.uH.create({
      data: { tenantId: session.tenantId, numero, tipo: tipo || "Standard", ordem: ordem || 0 },
    });
    return NextResponse.json(uh, { status: 201 });
  } catch {
    return NextResponse.json({ error: "UH já existe" }, { status: 409 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { id, numero, tipo, ordem, ativo } = await req.json();
  const uh = await prisma.uH.update({
    where: { id },
    data: { numero, tipo, ordem, ativo },
  });
  return NextResponse.json(uh);
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  await prisma.uH.update({ where: { id }, data: { ativo: false } });
  return NextResponse.json({ ok: true });
}
