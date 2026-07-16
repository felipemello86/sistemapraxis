import { NextRequest, NextResponse } from "next/server";
import { prisma, getSession } from "@praxis/core";
import { format } from "date-fns";

// Portado de apps/housekeeping/src/app/api/falha-lavanderia/route.ts (v1).
// Notificação via Telegram fica como TODO (ver mesmo comentário em sessoes/route.ts).

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { uhNumero, descricao, fotoUrl } = await req.json();

  if (!descricao?.trim()) {
    return NextResponse.json({ error: "Descrição obrigatória" }, { status: 400 });
  }
  if (!uhNumero) {
    return NextResponse.json({ error: "uhNumero obrigatório" }, { status: 400 });
  }

  const data = format(new Date(), "yyyy-MM-dd");

  await prisma.falhaLavanderia.create({
    data: {
      tenantId: session.tenantId,
      data,
      uhNumero,
      descricao: descricao.trim(),
      reportadoPorNome: session.nome,
      reportadoPorRole: session.role,
      fotoUrl: fotoUrl ?? null,
    },
  });

  // TODO: notificar via Telegram todos os usuários do tenant com
  // telegramChatId cadastrado, quando o bot for portado.

  return NextResponse.json({ ok: true });
}

// GET /api/falha-lavanderia?data=YYYY-MM-DD — usado por telas de relatório
// (não portadas ainda). Retorna falhas do dia, mais recentes primeiro.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataParam = req.nextUrl.searchParams.get("data");

  const falhas = await prisma.falhaLavanderia.findMany({
    where: { tenantId: session.tenantId, ...(dataParam ? { data: dataParam } : {}) },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(falhas);
}
