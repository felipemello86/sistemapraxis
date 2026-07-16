import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";

// Portado de apps/housekeeping/src/app/api/programas/route.ts (v1). hotelId → tenantId.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const programs = await prisma.cleaningProgram.findMany({
    where: { tenantId: session.tenantId, ativo: true },
    include: { steps: { orderBy: { ordem: "asc" } } },
    orderBy: { nome: "asc" },
  });
  return NextResponse.json(programs);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { nome, tipo, steps } = await req.json();
  if (!nome) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });

  const program = await prisma.cleaningProgram.create({
    data: {
      tenantId: session.tenantId,
      nome,
      tipo: tipo || "ARRUMACAO",
      steps: { create: steps || [] },
    },
    include: { steps: { orderBy: { ordem: "asc" } } },
  });
  return NextResponse.json(program, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }

  const { id, nome, steps } = await req.json();

  await prisma.cleaningProgram.update({ where: { id }, data: { nome } });

  if (steps && Array.isArray(steps)) {
    const incomingIds = steps.filter((s: any) => s.id).map((s: any) => s.id);

    const stepsExistentes = await prisma.programStep.findMany({ where: { programId: id } });
    for (const existing of stepsExistentes) {
      if (!incomingIds.includes(existing.id)) {
        const temSessao = await prisma.sessionStep.count({ where: { stepId: existing.id } });
        if (temSessao === 0) {
          await prisma.programStep.delete({ where: { id: existing.id } });
        }
      }
    }

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s.id) {
        await prisma.programStep.update({
          where: { id: s.id },
          data: { titulo: s.titulo, descricao: s.descricao || "", ordem: i + 1 },
        });
      } else {
        await prisma.programStep.create({
          data: { programId: id, titulo: s.titulo, descricao: s.descricao || "", ordem: i + 1 },
        });
      }
    }
  }

  const program = await prisma.cleaningProgram.findUnique({
    where: { id },
    include: { steps: { orderBy: { ordem: "asc" } } },
  });
  return NextResponse.json(program);
}
