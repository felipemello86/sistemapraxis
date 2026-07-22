import { NextRequest, NextResponse } from "next/server";
import { prisma, getSession } from "@praxis/core";
import { dataAtualSP } from "@/lib/timezone";

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

  const data = dataAtualSP();

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

// GET /api/falha-lavanderia              → falhas agrupadas por dia (para o
//   gráfico da aba Lavanderia em /movimentos)
// GET /api/falha-lavanderia?data=YYYY-MM-DD → falhas detalhadas de um dia
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenantId = session.tenantId;

  const dataParam = req.nextUrl.searchParams.get("data");

  if (dataParam) {
    const falhas = await prisma.falhaLavanderia.findMany({
      where: { tenantId, data: dataParam },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        uhNumero: true,
        descricao: true,
        reportadoPorNome: true,
        reportadoPorRole: true,
        fotoUrl: true,
        createdAt: true,
      },
    });
    return NextResponse.json(falhas);
  }

  // Agrupado por dia para o gráfico (todos os registros — a tela mostra só
  // os últimos 7 dias, filtrados no client).
  const falhas = await prisma.falhaLavanderia.findMany({
    where: { tenantId },
    select: { data: true },
    orderBy: { data: "asc" },
  });

  const porDia = new Map<string, number>();
  for (const f of falhas) {
    porDia.set(f.data, (porDia.get(f.data) ?? 0) + 1);
  }

  const resultado = Array.from(porDia.entries())
    .map(([data, total]) => ({ data, total }))
    .sort((a, b) => a.data.localeCompare(b.data));

  return NextResponse.json(resultado);
}
