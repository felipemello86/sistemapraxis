import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { getRelatorioData } from "@/lib/relatorio-dados";
import { RelatorioPDF } from "@/lib/relatorio-pdf";
import { enviarRelatorioPDF } from "@/lib/telegram";
import { dataAtualSP } from "@/lib/timezone";

// Portado de apps/housekeeping/src/app/api/relatorio-diario/route.ts (v1).
// hotelId → tenantId. Único ponto do v2 que gera PDF (@react-pdf/renderer)
// e fala com a API do Telegram — precisa de TELEGRAM_BOT_TOKEN configurado
// na Vercel (bot criado via @BotFather) pra o POST funcionar de verdade; o
// GET (baixar PDF) funciona independente disso.
export const runtime = "nodejs";
export const maxDuration = 60;

// POST — gera PDF e envia via Telegram
// Body: { data?: string }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  // ATENDIMENTO tem as mesmas permissões de GERENTE em todo o módulo
  // Governança, exceto em Configurações — ver mesmo comentário em
  // selecao-uhs/route.ts.
  if (!["MASTER", "GERENTE", "ATENDIMENTO"].includes(session.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const tenantId = session.tenantId;
  const body = await req.json().catch(() => ({}));
  const data = body.data || dataAtualSP();

  try {
    const relData = await getRelatorioData(tenantId, data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(createElement(RelatorioPDF, { d: relData }) as any);
    const base64 = buffer.toString("base64");
    const fileName = `Relatorio_Gerencial_${data}.pdf`;

    const destinatarios = await prisma.user.findMany({
      where: {
        tenantId,
        telegramChatId: { not: null },
        ativo: true,
      },
      select: { telegramChatId: true, nome: true },
    });

    const linhasAtivas = relData.linhasUH.filter((l) => !l.emManutencao);
    // Agrupa por UH, não por linha de atribuição — numa mutirão (2+
    // camareiras na mesma UH/dia) `linhasUH` tem uma linha por camareira;
    // conta como concluída/reprovada assim que UMA das linhas atender o
    // critério, não exige as duas (pedido explícito do Felipe, 04/08/2026 —
    // mesmo ajuste de api/burndown e api/finalizacao-dia). Sem isso, o
    // resumo enviado no Telegram mostrava "X de Y" sem nunca bater 100% em
    // dias com mutirão informal (só uma camareira usava o app de fato).
    const porUh = new Map<string, { concluida: boolean; reprovada: boolean }>();
    for (const l of linhasAtivas) {
      const atual = porUh.get(l.uhId) ?? { concluida: false, reprovada: false };
      porUh.set(l.uhId, {
        concluida: atual.concluida || l.fimLimpeza !== null,
        reprovada: atual.reprovada || l.falhasCamareira > 0,
      });
    }
    const totalUhsAtivas = porUh.size;
    const concluidas = Array.from(porUh.values()).filter((v) => v.concluida).length;
    const reprovadas = Array.from(porUh.values()).filter((v) => v.reprovada).length;
    const conformidade = concluidas > 0 ? ((concluidas - reprovadas) / concluidas) * 100 : 0;
    const stats = { conformidade, concluidas, total: totalUhsAtivas, reprovadas };

    const resultados = await Promise.allSettled(
      destinatarios.map((u) =>
        enviarRelatorioPDF(u.telegramChatId!, relData.hotel.nome, relData.data, base64, fileName, stats)
      )
    );

    const erros = resultados.filter((r) => r.status === "rejected").length;
    return NextResponse.json({ ok: true, enviados: destinatarios.length, erros });
  } catch (e: any) {
    console.error("[Relatório] Erro:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET — baixa o PDF direto
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Leitura sempre liberada, mesmo sem acesso ao módulo (ver comentário em
  // apps/maintenance/src/app/page.tsx) — POST acima continua gateado.

  const tenantId = session.tenantId;
  const data = req.nextUrl.searchParams.get("data") || dataAtualSP();

  try {
    const relData = await getRelatorioData(tenantId, data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(createElement(RelatorioPDF, { d: relData }) as any);

    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Relatorio_Gerencial_${data}.pdf"`,
      },
    });
  } catch (e: any) {
    console.error("[Relatório] Erro:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
