import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, prisma } from "@praxis/core";

export const runtime = "nodejs";

// CRM Fase 2 (30/07/2026) — usado pelo WhatsAppChat.tsx (client component)
// pra dar "polling" na conversa a cada poucos segundos enquanto a tela do
// lead está aberta. Mensagens recebidas chegam via webhook (POST
// /api/whatsapp/webhook) de forma assíncrona — sem WebSocket/Pusher na
// suíte, polling simples é a forma mais barata de refletir isso na tela sem
// precisar dar F5. Protegido por sessão de admin, igual toda outra tela do
// CRM (diferente do webhook, que é público — a Meta não manda cookie).
export async function GET(req: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const leadId = req.nextUrl.searchParams.get("leadId");
  if (!leadId) return NextResponse.json({ error: "leadId obrigatório." }, { status: 400 });

  const mensagens = await prisma.whatsAppMensagem.findMany({
    where: { leadId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ mensagens });
}
