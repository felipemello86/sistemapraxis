import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma, sendPushToUser } from "@praxis/core";
import { calcularScoreUH, calcularScoreSuperLimpeza } from "@/lib/scoring";
import { dataAtualSP } from "@/lib/timezone";

// Mesmo critério de api/selecao-uhs/route.ts e api/atribuicoes/route.ts —
// Atendimento tem o mesmo nível de acesso de Gerente em Governança, exceto
// em Configurações (decisão explícita do Felipe).
function onlyManagerOrMaster(role: string) {
  return ["MASTER", "GERENTE", "ATENDIMENTO"].includes(role);
}

// Fluxo de "Finalização do Dia" — portado do v1 (apps/housekeeping v1,
// api/finalizacao-dia/route.ts), adaptado pro schema v2:
//   - Ranking reaproveita a mesma fórmula de api/scores/route.ts, mas
//     escopado só ao dia (`data`), sem o relógio de disponibilidade
//     completo (deslocamento/geo) — aqui o objetivo é a revisão rápida da
//     governanta, não o extrato de pontuação; duração usada é a bruta
//     (iniciadaEm→finalizadaEm) da própria sessão.
//   - "Exclusão de UH do score" ganhou justificativa obrigatória (o v1 já
//     tinha isso) e fica registrada em CleaningSession.justificativaExclusao
//     — diferente do endpoint solto /api/scores/excluir (MASTER-only, sem
//     justificativa, pensado pra correções pontuais fora desse fluxo).
//   - PDF do v1 não foi portado (ver decisão do Felipe — o push leva pra
//     tela de Relatórios já existente, /governance/relatorios, em vez de
//     anexar arquivo). O push de "dia finalizado" vai pra TODOS os usuários
//     ativos do tenant (não só MASTER/governanta como no v1), decisão
//     explícita do Felipe.
//
// Permissão: GOVERNANTA, GERENTE ou MASTER (mesmo padrão de
// api/selecao-uhs/route.ts pra ações de governança).

// Só sessão — usada pelo GET. Leitura sempre liberada, mesmo sem acesso ao
// módulo ou cargo diferente de Governança/Gerência (ver comentário em
// apps/maintenance/src/app/page.tsx); quem não pode operar só não teria os
// botões de ação habilitados na tela (GovernantaView já cuida disso).
async function checarSessao() {
  const session = await getSession();
  if (!session) return { erro: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  return { session } as const;
}

// Módulo + cargo — usada pelo PATCH (ações de escrita: excluir/reincluir UH
// do ranking, confirmar o dia).
async function checarPermissao() {
  const check = await checarSessao();
  if ("erro" in check) return check;
  const { session } = check;
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return { erro: NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 }) } as const;
  }
  const isGerente = onlyManagerOrMaster(session.role);
  const isGovernanta = session.role === "GOVERNANTA";
  if (!isGerente && !isGovernanta) {
    return { erro: NextResponse.json({ error: "Sem permissão" }, { status: 403 }) } as const;
  }
  return { session } as const;
}

async function montarRanking(tenantId: string, data: string) {
  const config = await prisma.hkConfig.findUnique({ where: { tenantId } });
  const targetMinutos = config?.targetMinutes ?? 25;

  const sessoes = await prisma.cleaningSession.findMany({
    where: {
      camareira: { tenantId },
      finalizadaEm: { not: null },
      assignment: { data, program: { tipo: { not: "LIMPEZA_COMPLETA" } } },
    },
    include: {
      inspection: { select: { totalFalhas: true } },
      assignment: { select: { program: { select: { tipo: true } } } },
      uh: { select: { numero: true } },
      camareira: { select: { id: true, nome: true, foto: true } },
    },
    relationLoadStrategy: "join",
  });

  const atribuicoesDoDia = await prisma.dailyAssignment.findMany({
    where: { tenantId, data },
    select: { uhId: true },
  });
  const contagemPorUH = new Map<string, number>();
  for (const a of atribuicoesDoDia) {
    contagemPorUH.set(a.uhId, (contagemPorUH.get(a.uhId) ?? 0) + 1);
  }
  const isMultiplaCamareira = (uhId: string) => (contagemPorUH.get(uhId) ?? 0) > 1;

  const porCamareira = new Map<string, typeof sessoes>();
  for (const s of sessoes) {
    porCamareira.set(s.camareiraId, [...(porCamareira.get(s.camareiraId) ?? []), s]);
  }

  const ranking = Array.from(porCamareira.values()).map((minhasSessoes) => {
    const cam = minhasSessoes[0].camareira;
    let totalScore = 0;
    let totalFalhas = 0;
    let validas = 0;

    const uhs = minhasSessoes.map((s) => {
      const multipla = isMultiplaCamareira(s.uhId);
      const falhas = s.inspection?.totalFalhas ?? 0;
      const duracao = s.duracaoSegundos ?? 0;
      const score = multipla
        ? 0
        : s.assignment.program?.tipo === "SUPER_LIMPEZA"
          ? calcularScoreSuperLimpeza(falhas)
          : calcularScoreUH(duracao, falhas, targetMinutos);
      if (!s.excluidoDoScore && !multipla) {
        totalScore += score;
        totalFalhas += falhas;
        validas += 1;
      }
      return {
        sessaoId: s.id,
        uhNumero: s.uh.numero,
        falhas,
        score,
        excluidoDoScore: s.excluidoDoScore,
        justificativaExclusao: s.justificativaExclusao,
        multiplaCamareira: multipla,
      };
    });

    return {
      camareiraId: cam.id,
      nome: cam.nome,
      foto: cam.foto,
      totalUHs: validas,
      totalFalhas,
      mediaScore: validas > 0 ? Math.round((totalScore / validas) * 10) / 10 : null,
      uhs,
    };
  });

  ranking.sort((a, b) => (b.mediaScore ?? -1) - (a.mediaScore ?? -1));
  return ranking;
}

// GET /api/finalizacao-dia?data=YYYY-MM-DD
// Verifica se o dia está pronto pra fechar (todas as UHs atribuídas — que
// não estejam em manutenção — já foram inspecionadas) e devolve o ranking.
export async function GET(req: NextRequest) {
  const check = await checarSessao();
  if ("erro" in check) return check.erro;
  const tenantId = check.session.tenantId;

  const data = req.nextUrl.searchParams.get("data") || dataAtualSP();

  const assignments = await prisma.dailyAssignment.findMany({
    where: { tenantId, data },
    select: { status: true, uh: { select: { emManutencao: true } } },
  });
  const relevantes = assignments.filter((a) => !a.uh.emManutencao);
  const pronta = relevantes.length > 0 && relevantes.every((a) => a.status === "INSPECIONADO");

  const fechamento = await prisma.dailyClosure.findUnique({ where: { tenantId_data: { tenantId, data } } });

  const ranking = pronta || fechamento ? await montarRanking(tenantId, data) : [];

  return NextResponse.json({
    data,
    pronta,
    totalUHsAtribuidas: relevantes.length,
    totalInspecionadas: relevantes.filter((a) => a.status === "INSPECIONADO").length,
    finalizado: !!fechamento,
    finalizadoEm: fechamento?.finalizadoEm ?? null,
    finalizadoPorNome: fechamento?.finalizadoPorNome ?? null,
    ranking,
  });
}

// PATCH /api/finalizacao-dia — ações: excluir_uh, reincluir_uh, confirmar_dia
export async function PATCH(req: NextRequest) {
  const check = await checarPermissao();
  if ("erro" in check) return check.erro;
  const { session } = check;
  const tenantId = session.tenantId;

  const { action, data, sessaoId, justificativa } = await req.json();

  if (action === "excluir_uh") {
    if (!sessaoId) return NextResponse.json({ error: "sessaoId obrigatório" }, { status: 400 });
    if (!justificativa?.trim()) {
      return NextResponse.json({ error: "Justificativa obrigatória pra excluir uma UH do ranking" }, { status: 400 });
    }
    await prisma.cleaningSession.update({
      where: { id: sessaoId },
      data: { excluidoDoScore: true, justificativaExclusao: justificativa.trim() },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "reincluir_uh") {
    if (!sessaoId) return NextResponse.json({ error: "sessaoId obrigatório" }, { status: 400 });
    await prisma.cleaningSession.update({
      where: { id: sessaoId },
      data: { excluidoDoScore: false, justificativaExclusao: null },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "confirmar_dia") {
    if (!data) return NextResponse.json({ error: "data obrigatória" }, { status: 400 });

    await prisma.dailyClosure.upsert({
      where: { tenantId_data: { tenantId, data } },
      update: {},
      create: { tenantId, data, finalizadoPorNome: session.nome },
    });

    const ranking = await montarRanking(tenantId, data);
    const top = ranking.find((r) => r.mediaScore != null);
    const totalUHs = ranking.reduce((acc, r) => acc + r.totalUHs, 0);
    // data é sempre "YYYY-MM-DD" (ver dataAtualSP/dataParam)
    const dd = data.slice(8, 10);
    const mm = data.slice(5, 7);

    const corpo = top
      ? `${totalUHs} UH${totalUHs === 1 ? "" : "s"} limpas. Top do dia: ${top.nome} (${top.mediaScore} pts).`
      : `${totalUHs} UH${totalUHs === 1 ? "" : "s"} limpas hoje.`;

    // Push pra TODOS os usuários ativos do tenant (decisão do Felipe — não só
    // MASTER/governanta como era no v1 via Telegram).
    const usuarios = await prisma.user.findMany({
      where: { tenantId, ativo: true },
      select: { id: true },
    });
    for (const u of usuarios) {
      await sendPushToUser(u.id, {
        title: `📋 Dia finalizado — ${dd}/${mm}`,
        body: corpo,
        data: { tipo: "fim_dia", data },
      });
    }

    return NextResponse.json({ ok: true, ranking });
  }

  return NextResponse.json({ error: "Ação desconhecida" }, { status: 400 });
}
