import { NextRequest, NextResponse } from "next/server";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";
import { calcularScoreUH } from "@/lib/scoring";
import { dataAtualSP } from "@/lib/timezone";

// Portado de apps/housekeeping/src/app/api/logs/route.ts (v1). Não existe
// tabela de log/auditoria dedicada — os eventos são montados on-the-fly a
// partir de DailyAssignment, CleaningSession, InspectionSession e
// DailyUHSelection (mesmo padrão do burndown). hotelId → tenantId;
// hotelConfig → HkConfig. O caminho de "criadoPorNome via token de
// substituta" foi removido em v2 (ver atribuicoes/route.ts) — aqui só lê o
// campo, já sempre preenchido a partir de session.nome.
// `relationLoadStrategy: "join"` ligado nas 3 queries com include (preview
// feature `relationJoins`, ver packages/core/prisma/schema.prisma). NÃO
// mexi no `prisma.inspectionSession.findUnique` dentro do for-loop (~linha
// 136) — isso é um N+1 de verdade (uma query por sessão com inspeção, não
// só relações), pré-existente do v1, fora do escopo desta otimização
// pontual; vale revisitar se este endpoint continuar pesado.

export type LogEvento = {
  id: string;
  tipo:
    | "ATRIBUICAO_CRIADA"
    | "UH_LIBERADA"
    | "LIMPEZA_INICIADA"
    | "LIMPEZA_CONCLUIDA"
    | "INSPECAO_INICIADA"
    | "INSPECAO_CONCLUIDA"
    | "COBERTURA_CRIADA";
  timestamp: string;
  uhNumero: string;
  atoreNome: string; // camareira ou governanta
  atoreRole: string; // CAMAREIRA | GOVERNANTA | SISTEMA
  extra?: Record<string, unknown>;
};

// GET /api/logs?data=yyyy-MM-dd&tipo=&ator=
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasModuleAccess(session, "HOUSEKEEPING"))) {
    return NextResponse.json({ error: "Sem acesso ao módulo" }, { status: 403 });
  }
  const tenantId = session.tenantId;

  const params = req.nextUrl.searchParams;
  // data do cliente para evitar bug de timezone
  const dataParam = params.get("data") || dataAtualSP();
  const tipoParam = params.get("tipo") || "";
  const atorParam = params.get("ator") || "";

  const eventos: LogEvento[] = [];

  // ── 1. Atribuições criadas ──────────────────────────────────────────────────
  const atribuicoes = await prisma.dailyAssignment.findMany({
    where: {
      tenantId,
      data: dataParam,
      ...(atorParam ? { camareiraId: atorParam } : {}),
    },
    include: {
      uh: { select: { numero: true } },
      camareira: { select: { nome: true } },
      program: { select: { nome: true } },
    },
    relationLoadStrategy: "join",
  });

  for (const a of atribuicoes) {
    eventos.push({
      id: `atrib-${a.id}`,
      tipo: "ATRIBUICAO_CRIADA",
      timestamp: a.createdAt.toISOString(),
      uhNumero: a.uh.numero,
      atoreNome: a.camareira.nome,
      atoreRole: "CAMAREIRA",
      extra: {
        programa: a.program?.nome ?? "—",
        status: a.status,
        operador: (a as any).criadoPorNome ?? null,
      },
    });

    // Liberação da UH (via assignment — liberar individual)
    if (a.liberadaEm) {
      eventos.push({
        id: `lib-${a.id}`,
        tipo: "UH_LIBERADA",
        timestamp: a.liberadaEm.toISOString(),
        uhNumero: a.uh.numero,
        atoreNome: a.camareira.nome,
        atoreRole: "SISTEMA",
      });
    }
  }

  // ── 2. Sessões de limpeza ───────────────────────────────────────────────────
  const sessoes = await prisma.cleaningSession.findMany({
    where: {
      camareira: { tenantId },
      assignment: { data: dataParam },
      ...(atorParam ? { camareiraId: atorParam } : {}),
    },
    include: {
      uh: { select: { numero: true } },
      camareira: { select: { nome: true } },
      inspection: {
        select: { finalizadaEm: true, totalFalhas: true, governanta: { select: { nome: true, id: true } } },
      },
    },
    relationLoadStrategy: "join",
  });

  const config = await prisma.hkConfig.findUnique({ where: { tenantId } });
  const target = config?.targetMinutes ?? 25;

  for (const s of sessoes) {
    // Início
    eventos.push({
      id: `ini-${s.id}`,
      tipo: "LIMPEZA_INICIADA",
      timestamp: s.iniciadaEm.toISOString(),
      uhNumero: s.uh.numero,
      atoreNome: s.camareira.nome,
      atoreRole: "CAMAREIRA",
    });

    // Fim
    if (s.finalizadaEm) {
      eventos.push({
        id: `fim-${s.id}`,
        tipo: "LIMPEZA_CONCLUIDA",
        timestamp: s.finalizadaEm.toISOString(),
        uhNumero: s.uh.numero,
        atoreNome: s.camareira.nome,
        atoreRole: "CAMAREIRA",
        extra: { duracaoSegundos: s.duracaoSegundos },
      });
    }

    // Inspeção
    if (s.inspection) {
      // início da inspeção — não temos `iniciadaEm` separado no include acima;
      // busca de novo a sessão de inspeção com o campo.
      const insp = await prisma.inspectionSession.findUnique({
        where: { sessionId: s.id },
        select: { iniciadaEm: true, finalizadaEm: true, totalFalhas: true, governanta: { select: { nome: true } } },
      });
      if (insp) {
        if (!atorParam || atorParam === insp.governanta?.nome) {
          eventos.push({
            id: `insp-ini-${s.id}`,
            tipo: "INSPECAO_INICIADA",
            timestamp: insp.iniciadaEm.toISOString(),
            uhNumero: s.uh.numero,
            atoreNome: insp.governanta?.nome ?? "Governanta",
            atoreRole: "GOVERNANTA",
          });

          if (insp.finalizadaEm) {
            const score = calcularScoreUH(s.duracaoSegundos ?? 0, insp.totalFalhas, target);
            eventos.push({
              id: `insp-fim-${s.id}`,
              tipo: "INSPECAO_CONCLUIDA",
              timestamp: insp.finalizadaEm.toISOString(),
              uhNumero: s.uh.numero,
              atoreNome: insp.governanta?.nome ?? "Governanta",
              atoreRole: "GOVERNANTA",
              extra: { totalFalhas: insp.totalFalhas, score },
            });
          }
        }
      }
    }
  }

  // ── 3. DailyUHSelection liberações ────────────────────────────────────────
  const selecoes = await prisma.dailyUHSelection.findMany({
    where: { tenantId, data: dataParam, liberada: true, liberadaEm: { not: null } },
    include: { uh: { select: { numero: true } } },
    relationLoadStrategy: "join",
  });

  for (const sel of selecoes) {
    // Substitui (ou adiciona) evento de liberação com operador correto
    const idxExistente = eventos.findIndex((e) => e.tipo === "UH_LIBERADA" && e.uhNumero === sel.uh.numero);
    const liberadoPor = (sel as any).liberadoPorNome ?? null;
    const evento: LogEvento = {
      id: `sel-${sel.id}`,
      tipo: "UH_LIBERADA",
      timestamp: sel.liberadaEm!.toISOString(),
      uhNumero: sel.uh.numero,
      atoreNome: liberadoPor ?? "Sistema",
      atoreRole: liberadoPor ? "GERENTE" : "SISTEMA",
      extra: { operador: liberadoPor },
    };
    if (idxExistente >= 0) {
      eventos[idxExistente] = evento; // substitui entrada sem operador
    } else {
      eventos.push(evento);
    }
  }

  // ── Filtrar por tipo ────────────────────────────────────────────────────────
  const filtrados = tipoParam ? eventos.filter((e) => e.tipo === tipoParam) : eventos;

  // ── Ordenar por timestamp desc ──────────────────────────────────────────────
  filtrados.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return NextResponse.json(filtrados);
}
