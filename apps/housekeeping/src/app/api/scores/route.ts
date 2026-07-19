import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";
import { calcularScoreUH, calcularScoreSuperLimpeza } from "@/lib/scoring";
import { format, startOfMonth, endOfMonth } from "date-fns";

// Portado de apps/housekeeping/src/app/api/scores/route.ts (v1).
// hotelId → tenantId; hotelConfig → HkConfig.
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
    select: { id: true, nome: true, foto: true },
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
      // program.tipo decide a fórmula de score usada abaixo (Super Limpeza
      // ⭐️ é fixo 120 - 10/falha, sem entrar tempo na conta).
      assignment: { select: { data: true, program: { select: { tipo: true } } } },
      uh: { select: { numero: true } },
    },
    relationLoadStrategy: "join",
  });

  const config = await prisma.hkConfig.findUnique({ where: { tenantId } });
  const targetMinutos = config?.targetMinutes ?? 25;

  // UHs com mais de uma camareira atribuída no mesmo dia (mutirão/"a duas")
  // não pontuam pra ninguém — tempo e inspeção deixam de ser individualmente
  // atribuíveis. Detectado dinamicamente (não persistido): conta quantas
  // DailyAssignment existem por (data, uhId) dentro do período consultado.
  const atribuicoesDoPeriodo = await prisma.dailyAssignment.findMany({
    where: { tenantId, ...(Object.keys(whereData).length > 0 ? whereData : {}) },
    select: { data: true, uhId: true },
  });
  const contagemPorUHData = new Map<string, number>();
  for (const a of atribuicoesDoPeriodo) {
    const chave = `${a.data}|${a.uhId}`;
    contagemPorUHData.set(chave, (contagemPorUHData.get(chave) ?? 0) + 1);
  }
  const isMultiplaCamareira = (data: string, uhId: string) =>
    (contagemPorUHData.get(`${data}|${uhId}`) ?? 0) > 1;

  // Queixas de hóspede do tipo Limpeza registradas no período (ver
  // api/selecao-uhs/route.ts, ação "registrar_queixa") — penalidade
  // independente das sessões de limpeza: soma ao total de pontos do
  // período da camareira mesmo que a sessão daquele dia ainda nem exista ou
  // já tenha sido concluída (decisão explícita do Felipe).
  const queixasLimpezaDoPeriodo = await prisma.guestComplaint.findMany({
    where: {
      tenantId,
      tipo: "LIMPEZA",
      camareiraId: { not: null },
      ...(Object.keys(whereData).length > 0 ? whereData : {}),
    },
    select: {
      id: true,
      camareiraId: true,
      pontosDescontados: true,
      data: true,
      descricao: true,
      uh: { select: { numero: true } },
    },
  });
  const queixasPorCamareira = new Map<string, typeof queixasLimpezaDoPeriodo>();
  for (const q of queixasLimpezaDoPeriodo) {
    const key = q.camareiraId as string;
    queixasPorCamareira.set(key, [...(queixasPorCamareira.get(key) ?? []), q]);
  }

  // Calcular scores por camareira
  const scores = camareiras.map((cam) => {
    const minhasSessoes = sessoes.filter((s) => s.camareiraId === cam.id);
    // Para o score, só conta as não excluídas e sem múltiplas camareiras na UH
    const sessoesValidas = minhasSessoes.filter(
      (s) => !s.excluidoDoScore && !isMultiplaCamareira(s.assignment.data, s.uhId)
    );

    const queixasCam = queixasPorCamareira.get(cam.id) ?? [];
    const totalPenalidades = queixasCam.reduce((acc, q) => acc + (q.pontosDescontados ?? 0), 0);
    const queixasLimpeza = queixasCam.map((q) => ({
      id: q.id,
      data: q.data,
      uhNumero: q.uh.numero,
      descricao: q.descricao,
      pontosDescontados: q.pontosDescontados ?? 0,
    }));

    if (minhasSessoes.length === 0) {
      return { ...cam, mediaScore: null, totalUHs: 0, totalFalhas: 0, detalhes: [], totalPenalidades, queixasLimpeza };
    }

    let totalScore = 0;
    let totalFalhas = 0;

    // Monta detalhes com TODAS as sessões (incluindo excluídas para o MASTER ver)
    const detalhes = minhasSessoes.map((s) => {
      const multiplaCamareira = isMultiplaCamareira(s.assignment.data, s.uhId);
      const falhas = s.inspection?.totalFalhas ?? 0;
      const score = multiplaCamareira
        ? 0
        : s.assignment.program?.tipo === "SUPER_LIMPEZA"
          ? calcularScoreSuperLimpeza(falhas)
          : calcularScoreUH(s.duracaoSegundos ?? 0, falhas, targetMinutos);
      if (!s.excluidoDoScore && !multiplaCamareira) {
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
        multiplaCamareira,
      };
    });

    // Penalidade de queixa de Limpeza soma ao total do período antes de
    // tirar a média — reduz o mediaScore mas não conta como uma UH a mais
    // (totalUHs continua sendo a contagem de sessões válidas).
    const mediaScore = sessoesValidas.length > 0
      ? Math.max(0, Math.round(((totalScore - totalPenalidades) / sessoesValidas.length) * 10) / 10)
      : null;

    return {
      ...cam,
      mediaScore,
      totalUHs: sessoesValidas.length,
      totalFalhas,
      detalhes,
      totalPenalidades,
      queixasLimpeza,
    };
  });

  scores.sort((a, b) => (b.mediaScore ?? -1) - (a.mediaScore ?? -1));
  return NextResponse.json(scores);
}
