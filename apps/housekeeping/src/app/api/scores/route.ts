import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";
import { calcularScoreUH } from "@/lib/scoring";
import { format, startOfMonth, endOfMonth } from "date-fns";

// Portado de apps/housekeeping/src/app/api/scores/route.ts (v1).
// hotelId → tenantId; hotelConfig → HkConfig. User v2 não tem campo `foto`
// (a UI já cai pra iniciais quando null).
//
// GET /api/scores?periodo=hoje|mes|alltime|custom&data=yyyy-MM-dd
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  const tenantId = session.tenantId;
  const isMaster = session.role === "MASTER";

  const periodo = req.nextUrl.searchParams.get("periodo") || "hoje";
  // Usa a data enviada pelo cliente (evita bug de timezone: Vercel usa UTC)
  const hoje = req.nextUrl.searchParams.get("data") || format(new Date(), "yyyy-MM-dd");

  let whereData: any = {};
  if (periodo === "hoje") {
    whereData = { data: hoje };
  } else if (periodo === "mes") {
    const mesBase = new Date(hoje + "T12:00:00");
    const ini = format(startOfMonth(mesBase), "yyyy-MM-dd");
    const fim = format(endOfMonth(mesBase), "yyyy-MM-dd");
    whereData = { data: { gte: ini, lte: fim } };
  } else if (periodo === "custom") {
    const dataIni = req.nextUrl.searchParams.get("dataIni");
    const dataFim = req.nextUrl.searchParams.get("dataFim");
    if (dataIni && dataFim) {
      whereData = { data: { gte: dataIni, lte: dataFim } };
    }
  }

  // Buscar camareiras
  const camareiras = await prisma.user.findMany({
    where: { tenantId, role: "CAMAREIRA", ativo: true },
    select: { id: true, nome: true },
  });

  // Base where para sessões
  const sessionWhere: any = {
    camareira: { tenantId },
    finalizadaEm: { not: null },
    assignment: {
      ...(Object.keys(whereData).length > 0 ? whereData : {}),
      program: { tipo: { not: "LIMPEZA_COMPLETA" } },
    },
  };

  // MASTER vê todas (incluindo excluídas, para poder reincluir)
  // Outros veem apenas as não excluídas
  if (!isMaster) {
    sessionWhere.excluidoDoScore = false;
  }

  const sessoes = await prisma.cleaningSession.findMany({
    where: sessionWhere,
    include: {
      inspection: { select: { totalFalhas: true } },
      assignment: { select: { data: true } },
      uh: { select: { numero: true } },
    },
  });

  const config = await prisma.hkConfig.findUnique({ where: { tenantId } });
  const targetMinutos = config?.targetMinutes ?? 25;

  // Calcular scores por camareira
  const scores = camareiras.map((cam) => {
    const minhasSessoes = sessoes.filter((s) => s.camareiraId === cam.id);
    // Para o score, só conta as não excluídas
    const sessoesValidas = minhasSessoes.filter((s) => !s.excluidoDoScore);

    if (minhasSessoes.length === 0) return { ...cam, foto: null, mediaScore: null, totalUHs: 0, totalFalhas: 0, detalhes: [] };

    let totalScore = 0;
    let totalFalhas = 0;

    // Monta detalhes com TODAS as sessões (incluindo excluídas para o MASTER ver)
    const detalhes = minhasSessoes.map((s) => {
      const falhas = s.inspection?.totalFalhas ?? 0;
      const score = calcularScoreUH(s.duracaoSegundos ?? 0, falhas, targetMinutos);
      if (!s.excluidoDoScore) {
        totalFalhas += falhas;
        totalScore += score;
      }
      return {
        sessaoId: s.id,
        assignmentId: s.assignmentId,
        uhNumero: s.uh.numero,
        data: s.assignment.data,
        duracaoSegundos: s.duracaoSegundos,
        falhas,
        score,
        excluidoDoScore: s.excluidoDoScore,
      };
    });

    const mediaScore = sessoesValidas.length > 0
      ? Math.round((totalScore / sessoesValidas.length) * 10) / 10
      : null;

    return {
      ...cam,
      foto: null,
      mediaScore,
      totalUHs: sessoesValidas.length,
      totalFalhas,
      detalhes,
    };
  });

  scores.sort((a, b) => (b.mediaScore ?? -1) - (a.mediaScore ?? -1));
  return NextResponse.json(scores);
}
