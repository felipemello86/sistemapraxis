import { NextRequest, NextResponse } from "next/server";
import { getSession, prisma } from "@praxis/core";
import { calcularScoreUH, calcularScoreSuperLimpeza } from "@/lib/scoring";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { dataAtualSP } from "@/lib/timezone";

// Portado de apps/housekeeping/src/app/api/scores/route.ts (v1).
// hotelId → tenantId; hotelConfig → HkConfig.
//
// GET /api/scores?periodo=hoje|mes|alltime|custom&data=yyyy-MM-dd
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Leitura sempre liberada, mesmo sem acesso ao módulo (ver comentário em
  // apps/maintenance/src/app/page.tsx) — PATCH abaixo continua gateado.
  const tenantId = session.tenantId;
  const isMaster = session.role === "MASTER";

  const periodo = req.nextUrl.searchParams.get("periodo") || "hoje";
  // Usa a data enviada pelo cliente (evita bug de timezone: Vercel usa UTC)
  const hoje = req.nextUrl.searchParams.get("data") || dataAtualSP();

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
  const turnoInicioHora = config?.turnoInicioHora ?? "08:00";

  // ── Relógio de disponibilidade (anti-sonegação de "iniciar") ──────────────
  // Antes, o score de velocidade usava direto finalizadaEm - iniciadaEm, e
  // iniciadaEm é um clique que a própria camareira controla — dava pra
  // começar a arrumar de verdade e só apertar "iniciar" bem depois, escondendo
  // o tempo real gasto. Decisão do Felipe (19/07): em vez de pontuar esse
  // "deslocamento" como um bloco à parte, o relógio pontuado passa a contar
  // de max(UH liberada, fim da UH anterior da mesma camareira no mesmo dia,
  // início do turno) até finalizadaEm — nenhum desses três marcos é
  // controlado pela camareira. turnoInicioHora é só o piso do dia inteiro,
  // pra a 1ª UH liberada de madrugada não penalizar quem ainda nem chegou.
  const liberacoes = await prisma.dailyUHSelection.findMany({
    where: { tenantId, ...(Object.keys(whereData).length > 0 ? whereData : {}) },
    select: { data: true, uhId: true, liberadaEm: true },
  });
  const liberadaEmPorUH = new Map<string, Date | null>();
  for (const l of liberacoes) {
    liberadaEmPorUH.set(`${l.data}|${l.uhId}`, l.liberadaEm);
  }
  function turnoInicioDate(data: string): Date {
    // Brasil não observa mais horário de verão desde 2019 — offset fixo
    // -03:00 (mesma convenção de lib/late-checkout.ts).
    return new Date(`${data}T${turnoInicioHora}:00-03:00`);
  }

  // Encadeia "fim da UH anterior" usando TODAS as sessões finalizadas da
  // camareira no período — não só o subconjunto elegível pra score (sem essa
  // sessão excluída/Super Limpeza no meio, o encadeamento pularia ela e
  // acabaria ancorando a UH seguinte cedo demais, superestimando o tempo
  // pontuado dela). O filtro de elegibilidade pro score em si continua sendo
  // aplicado depois, no cálculo de `sessoes`.
  const todasSessoesDoPeriodo = await prisma.cleaningSession.findMany({
    where: {
      camareira: { tenantId },
      finalizadaEm: { not: null },
      assignment: Object.keys(whereData).length > 0 ? whereData : undefined,
    },
    select: {
      id: true,
      camareiraId: true,
      uhId: true,
      iniciadaEm: true,
      finalizadaEm: true,
      assignment: { select: { data: true } },
      uh: { select: { propertyId: true } },
    },
  });
  const sessoesPorCamareiraDia = new Map<string, typeof todasSessoesDoPeriodo>();
  for (const s of todasSessoesDoPeriodo) {
    const chave = `${s.camareiraId}|${s.assignment.data}`;
    sessoesPorCamareiraDia.set(chave, [...(sessoesPorCamareiraDia.get(chave) ?? []), s]);
  }

  // Georreferenciamento — chegada confirmada por GPS na Property da UH (ver
  // GeoArrival, api/geo/checkin/route.ts). Indexado por camareira+dia+property
  // pra achar rapidinho a chegada relevante de cada sessão abaixo.
  const geoArrivals = await prisma.geoArrival.findMany({
    where: { tenantId, ...(Object.keys(whereData).length > 0 ? whereData : {}) },
    select: { data: true, camareiraId: true, propertyId: true, chegadaEm: true },
  });
  const chegadaGeoPorCamareiraDiaProperty = new Map<string, Date>();
  for (const g of geoArrivals) {
    chegadaGeoPorCamareiraDiaProperty.set(`${g.camareiraId}|${g.data}|${g.propertyId}`, g.chegadaEm);
  }

  const duracaoEfetivaPorSessao = new Map<string, number>();
  for (const grupo of sessoesPorCamareiraDia.values()) {
    const ordenado = [...grupo].sort((a, b) => a.iniciadaEm.getTime() - b.iniciadaEm.getTime());
    let fimAnterior: Date | null = null;
    ordenado.forEach((s, idx) => {
      const liberadaEm = liberadaEmPorUH.get(`${s.assignment.data}|${s.uhId}`) ?? null;
      // A chegada GPS também entra como candidata à âncora — mas só a partir
      // da 2ª UH do dia (idx > 0). A 1ª UH do dia sempre conta a partir de
      // turnoInicioHora, independente de geo (decisão do Felipe: se o GPS
      // falhar ou a permissão for negada logo cedo, a 1ª UH não pode ficar
      // sem âncora nenhuma). Da 2ª UH em diante, se ela chegou na property
      // depois de liberada/do fim da UH anterior, o relógio só começa a
      // contar a partir da chegada de verdade — sem geo cadastrado ou sem
      // confirmação no dia, esse candidato simplesmente não entra e tudo
      // degrada pro comportamento anterior.
      const chegadaGeoEm =
        idx === 0
          ? null
          : chegadaGeoPorCamareiraDiaProperty.get(`${s.camareiraId}|${s.assignment.data}|${s.uh.propertyId}`) ?? null;
      const candidatos = [turnoInicioDate(s.assignment.data), liberadaEm, fimAnterior, chegadaGeoEm].filter(
        (d): d is Date => d != null
      );
      const ancora = new Date(Math.max(...candidatos.map((d) => d.getTime())));
      const fim = (s.finalizadaEm ?? s.iniciadaEm) as Date;
      const efetivaSegundos = Math.max(0, Math.round((fim.getTime() - ancora.getTime()) / 1000));
      duracaoEfetivaPorSessao.set(s.id, efetivaSegundos);
      fimAnterior = fim;
    });
  }

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
      titulo: true,
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
      titulo: q.titulo,
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
      // duracaoEfetivaSegundos é o tempo realmente pontuado (ver bloco do
      // "relógio de disponibilidade" acima) — pode ser bem maior que
      // duracaoSegundos (iniciadaEm→finalizadaEm) quando a camareira atrasa
      // o "iniciar" de propósito. duracaoSegundos continua exibido como dado
      // bruto/auditoria, mas não é mais o que decide o score.
      const duracaoEfetivaSegundos = duracaoEfetivaPorSessao.get(s.id) ?? s.duracaoSegundos ?? 0;
      const score = multiplaCamareira
        ? 0
        : s.assignment.program?.tipo === "SUPER_LIMPEZA"
          ? calcularScoreSuperLimpeza(falhas)
          : calcularScoreUH(duracaoEfetivaSegundos, falhas, targetMinutos);
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
        duracaoEfetivaSegundos,
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
