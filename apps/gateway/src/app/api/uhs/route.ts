import { NextRequest, NextResponse } from "next/server";
import { prisma, getSession } from "@praxis/core";
import { bloqueadoParaGerenciarCadastros } from "@/lib/auth-guard";

// Cadastro central de UHs — mesma decisão já tomada pra Usuários: um
// cadastro só, válido em qualquer módulo (Governança, Manutenção,
// Avaliações), em vez de cada módulo ter sua própria cópia com id próprio
// (era assim na v1 — Manutenção tinha `Unit`, Avaliações tinha `Property`,
// nenhum dos dois com FK real pra UH, só nome batido na mão). O CRUD (criar,
// renomear, desativar) mora aqui; o estado operacional específico de
// Governança (status, emManutencao, bloqueada, etc.) continua sendo escrito
// só pelo housekeeping — aqui só os campos genéricos: numero, tipo, ordem,
// ativo.

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sessão expirada" }, { status: 401 });

  const uhs = await prisma.uH.findMany({
    where: { tenantId: session.tenantId, ativo: true },
    select: { id: true, numero: true, tipo: true, ordem: true, ativo: true },
    orderBy: { ordem: "asc" },
  });
  return NextResponse.json(uhs);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const bloqueado = bloqueadoParaGerenciarCadastros(session);
  if (bloqueado) return bloqueado;

  const { numero, tipo, ordem } = await req.json();
  if (!numero) return NextResponse.json({ error: "Número obrigatório" }, { status: 400 });

  try {
    const uh = await prisma.uH.create({
      data: { tenantId: session!.tenantId, numero, tipo: tipo || "Standard", ordem: ordem || 0 },
    });
    return NextResponse.json(uh, { status: 201 });
  } catch {
    return NextResponse.json({ error: "UH já existe" }, { status: 409 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  const bloqueado = bloqueadoParaGerenciarCadastros(session);
  if (bloqueado) return bloqueado;

  const { id, numero, tipo, ordem, ativo } = await req.json();
  const uh = await prisma.uH.update({
    where: { id },
    data: { numero, tipo, ordem, ativo },
  });
  return NextResponse.json(uh);
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  const bloqueado = bloqueadoParaGerenciarCadastros(session);
  if (bloqueado) return bloqueado;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  await prisma.uH.update({ where: { id }, data: { ativo: false } });
  return NextResponse.json({ ok: true });
}
