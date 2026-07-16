import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma, getSession } from "@praxis/core";
import { bloqueadoParaGerenciarUsuarios } from "@/lib/auth-guard";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sessão expirada" }, { status: 401 });

  const users = await prisma.user.findMany({
    where: { tenantId: session.tenantId, ativo: true },
    orderBy: [{ role: "asc" }, { nome: "asc" }],
    include: { moduleAccess: { where: { enabled: true }, select: { module: true } } },
  });

  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      nome: u.nome,
      email: u.email,
      role: u.role,
      telegramChatId: u.telegramChatId,
      ativo: u.ativo,
      modules: u.moduleAccess.map((m) => m.module),
    }))
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const bloqueado = bloqueadoParaGerenciarUsuarios(session);
  if (bloqueado) return bloqueado;

  const { nome, email, role, telegramChatId, password, modules } = await req.json();
  if (!nome || !role || !email || !password) {
    return NextResponse.json({ error: "Nome, email, cargo e senha são obrigatórios" }, { status: 400 });
  }

  const moduleList: string[] = Array.isArray(modules) ? modules : [];
  // Fix em relação à v1: lá o formulário permitia criar um usuário sem
  // marcar nenhum módulo, o que dava origem a contas "fantasma" com
  // acesso zero e nenhum aviso — foi o suspeito nº1 de uma conta
  // duplicada e vazia descoberta em produção. Aqui isso é bloqueado de
  // propósito.
  if (moduleList.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos um módulo pra essa pessoa acessar." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        tenantId: session!.tenantId,
        nome,
        email: String(email).trim().toLowerCase(),
        role,
        telegramChatId: telegramChatId || null,
        passwordHash,
        moduleAccess: {
          create: moduleList.map((module) => ({ module: module as any, enabled: true })),
        },
      },
      select: { id: true, nome: true, email: true, role: true, telegramChatId: true },
    });
    return NextResponse.json(user, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") {
      return NextResponse.json({ error: "Este e-mail já está cadastrado para outro usuário" }, { status: 409 });
    }
    return NextResponse.json({ error: e.message || "Erro ao criar usuário" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  const bloqueado = bloqueadoParaGerenciarUsuarios(session);
  if (bloqueado) return bloqueado;

  const { id } = await req.json();
  await prisma.user.update({
    where: { id },
    data: { ativo: false },
  });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  const bloqueado = bloqueadoParaGerenciarUsuarios(session);
  if (bloqueado) return bloqueado;

  const { id, nome, email, role, telegramChatId, password, ativo, modules } = await req.json();
  const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;

  if (Array.isArray(modules)) {
    await prisma.userModuleAccess.deleteMany({ where: { userId: id } });
    if (modules.length > 0) {
      await prisma.userModuleAccess.createMany({
        data: modules.map((module: string) => ({ userId: id, module: module as any, enabled: true })),
      });
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      nome,
      email: email ? String(email).trim().toLowerCase() : undefined,
      role,
      telegramChatId,
      ativo,
      ...(passwordHash ? { passwordHash } : {}),
    },
    select: { id: true, nome: true, email: true, role: true, telegramChatId: true, ativo: true },
  });
  return NextResponse.json(user);
}
