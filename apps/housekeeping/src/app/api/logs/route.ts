import { NextRequest, NextResponse } from "next/server";
import { getSession, prisma } from "@praxis/core";
import { calcularScoreUH } from "@/lib/scoring";
import { dataAtualSP } from "@/lib/timezone";

// Extensão de cobertura de auditoria (pedido explícito do Felipe: "faz o
// mesmo pra governança", espelhando o que foi feito em Manutenção — ver
// apps/maintenance/src/app/page.tsx e apps/maintenance/src/app/actions/
// {data,correcao}.ts). As ações abaixo NÃO tinham fonte de dados própria
// pra reconstruir (like ATRIBUICAO_CRIADA a partir de DailyAssignment.
// createdAt) — foram instrumentadas via emitEvent() direto em cada rota
// (ver selecao-uhs, atribuicoes, sessoes, inspecoes, decisao-bloqueio,
// falhas-gerenciais, finalizacao-dia, configuracoes, bloqueio,
// falha-lavanderia, manutencao-reporte, scores/excluir(-todos), programas,
// inspecao-template). Mapeamento eventType -> LogEvento['tipo'] logo abaixo
// da query `auditEvents`.

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
    | "COBERTURA_CRIADA"
    | "FOTOS_EDITADAS"
    // ── Cobertura completa de auditoria (via AiEvent, ver bloco abaixo) ──
    | "SELECAO_DIA_EDITADA"
    | "SELECAO_DIA_CONFIRMADA"
    | "SELECAO_REABERTA"
    | "LIBERACAO_DESFEITA"
    | "MANUTENCAO_TOGGLE"
    | "UH_DESBLOQUEADA"
    | "RESERVA_ALTERADA"
    | "LATE_CHECKOUT_ALTERADO"
    | "ATRIBUICAO_RENOVADA"
    | "COMENTARIO_UH_ALTERADO"
    | "PRIORIDADE_UH_ALTERADA"
    | "QUEIXA_REGISTRADA"
    | "OBSERVACAO_ATRIBUICAO_ALTERADA"
    | "ATRIBUICAO_EDITADA"
    | "ATRIBUICAO_NOTIFICADA"
    | "ALTERACAO_SOLICITADA"
    | "ALTERACAO_DECIDIDA"
    | "ATRIBUICAO_REMOVIDA"
    | "ETAPA_CONCLUIDA"
    | "SESSAO_CANCELADA"
    | "MANUTENCAO_ETAPA_SESSAO"
    | "FALHA_AVALIADA"
    | "INSPECAO_CORRIGIDA"
    | "BLOQUEIO_DECIDIDO"
    | "FALHA_GERENCIAL_RESOLVIDA"
    | "RANKING_UH_ALTERADO"
    | "DIA_CONFIRMADO"
    | "CONFIGURACAO_ALTERADA"
    | "BLOQUEIO_MANUAL_CRIADO"
    | "FALHA_LAVANDERIA_REGISTRADA"
    | "NC_MANUTENCAO_REPORTADA"
    | "SCORE_SESSAO_ALTERADO"
    | "SCORE_LOTE_ALTERADO"
    | "PROGRAMA_CRIADO"
    | "PROGRAMA_EDITADO"
    | "TEMPLATE_INSPECAO_EDITADO";
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
  // Leitura sempre liberada, mesmo sem acesso ao módulo (ver comentário em
  // apps/maintenance/src/app/page.tsx) — esta rota é só de leitura.
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

    // Edição de fotos pós-conclusão (ver PATCH /api/sessoes, ação
    // "editar_fotos") — só guarda a ÚLTIMA edição (mesmo limite de
    // DailyUHSelection.liberadaEm/comentarioEm), então se a camareira editar
    // mais de uma vez no mesmo dia, só a mais recente aparece aqui.
    if ((s as any).fotosEditadasEm) {
      eventos.push({
        id: `fotos-edit-${s.id}`,
        tipo: "FOTOS_EDITADAS",
        timestamp: (s as any).fotosEditadasEm.toISOString(),
        uhNumero: s.uh.numero,
        atoreNome: (s as any).fotosEditadasPorNome ?? s.camareira.nome,
        atoreRole: "CAMAREIRA",
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

  // ── 4. AiEvent (cobertura completa de auditoria) ────────────────────────────
  // Ações que não têm tabela de origem própria pra reconstruir (ex.:
  // desfazer_liberacao, toggle_manutencao, decisão de bloqueio, resolução de
  // falha gerencial etc.) — instrumentadas via emitEvent() direto em cada
  // rota (ver comentário no topo do arquivo). Sem filtro de `ator` (a maioria
  // destas ações é de Governanta/Gerente/Atendimento/Master, não de
  // camareira, e o payload guarda só o nome, não o id, do ator — mesmo
  // critério "sem filtro de ator" já usado na timeline de Manutenção).
  // Filtra por dia (SP) comparando o createdAt do evento com dataParam, pra
  // manter a mesma UX de navegação por data do resto desta tela.
  const eventTipoPorEventType: Record<string, LogEvento["tipo"]> = {
    "housekeeping.log.selecao_dia_editada": "SELECAO_DIA_EDITADA",
    "housekeeping.log.selecao_dia_confirmada": "SELECAO_DIA_CONFIRMADA",
    "housekeeping.log.selecao_reaberta": "SELECAO_REABERTA",
    "housekeeping.log.liberacao_desfeita": "LIBERACAO_DESFEITA",
    "housekeeping.log.manutencao_toggle": "MANUTENCAO_TOGGLE",
    "housekeeping.log.uh_desbloqueada": "UH_DESBLOQUEADA",
    "housekeeping.log.reserva_alterada": "RESERVA_ALTERADA",
    "housekeeping.log.late_checkout_alterado": "LATE_CHECKOUT_ALTERADO",
    "housekeeping.log.atribuicao_renovada": "ATRIBUICAO_RENOVADA",
    "housekeeping.log.comentario_uh_alterado": "COMENTARIO_UH_ALTERADO",
    "housekeeping.log.prioridade_uh_alterada": "PRIORIDADE_UH_ALTERADA",
    "housekeeping.log.queixa_registrada": "QUEIXA_REGISTRADA",
    "housekeeping.log.observacao_atribuicao_alterada": "OBSERVACAO_ATRIBUICAO_ALTERADA",
    "housekeeping.log.atribuicao_editada": "ATRIBUICAO_EDITADA",
    "housekeeping.log.atribuicao_notificada": "ATRIBUICAO_NOTIFICADA",
    "housekeeping.log.alteracao_solicitada": "ALTERACAO_SOLICITADA",
    "housekeeping.log.alteracao_decidida": "ALTERACAO_DECIDIDA",
    "housekeeping.log.atribuicao_removida": "ATRIBUICAO_REMOVIDA",
    "housekeeping.log.etapa_concluida": "ETAPA_CONCLUIDA",
    "housekeeping.log.sessao_cancelada": "SESSAO_CANCELADA",
    "housekeeping.log.manutencao_etapa_sessao": "MANUTENCAO_ETAPA_SESSAO",
    "housekeeping.log.falha_avaliada": "FALHA_AVALIADA",
    "housekeeping.log.inspecao_corrigida": "INSPECAO_CORRIGIDA",
    "housekeeping.log.bloqueio_decidido": "BLOQUEIO_DECIDIDO",
    "housekeeping.log.falha_gerencial_resolvida": "FALHA_GERENCIAL_RESOLVIDA",
    "housekeeping.log.ranking_uh_alterado": "RANKING_UH_ALTERADO",
    "housekeeping.log.dia_confirmado": "DIA_CONFIRMADO",
    "housekeeping.log.configuracao_alterada": "CONFIGURACAO_ALTERADA",
    "housekeeping.log.bloqueio_manual_criado": "BLOQUEIO_MANUAL_CRIADO",
    "housekeeping.log.falha_lavanderia_registrada": "FALHA_LAVANDERIA_REGISTRADA",
    "housekeeping.log.nc_manutencao_reportada": "NC_MANUTENCAO_REPORTADA",
    "housekeeping.log.score_sessao_alterado": "SCORE_SESSAO_ALTERADO",
    "housekeeping.log.score_lote_alterado": "SCORE_LOTE_ALTERADO",
    "housekeeping.log.programa_criado": "PROGRAMA_CRIADO",
    "housekeeping.log.programa_editado": "PROGRAMA_EDITADO",
    "housekeeping.log.template_inspecao_editado": "TEMPLATE_INSPECAO_EDITADO",
  };

  // Limites do dia (SP) convertidos pra UTC, pra filtrar no banco em vez de
  // carregar todo o histórico de AiEvent do tenant a cada request. Brasil não
  // observa mais horário de verão desde 2019 — UTC-3 fixo, mesma simplificação
  // que dataAtualSP() já assume (sem tabela de fusos históricos).
  const inicioDiaUTC = new Date(`${dataParam}T03:00:00.000Z`);
  const fimDiaUTC = new Date(inicioDiaUTC.getTime() + 24 * 60 * 60 * 1000);

  const auditEvents = await prisma.aiEvent.findMany({
    where: { tenantId, module: "HOUSEKEEPING", createdAt: { gte: inicioDiaUTC, lt: fimDiaUTC } },
    select: { id: true, eventType: true, payload: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  for (const ev of auditEvents) {
    const tipo = eventTipoPorEventType[ev.eventType];
    if (!tipo) continue; // outros eventTypes (se algum dia existirem) ficam de fora, de propósito

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(ev.payload) as Record<string, unknown>;
    } catch {
      payload = {};
    }

    const uhNumero = typeof payload.uhNumero === "string" ? payload.uhNumero : "—";
    const atorNome = typeof payload.atorNome === "string" ? payload.atorNome : "—";

    eventos.push({
      id: `ai-${ev.id}`,
      tipo,
      timestamp: ev.createdAt.toISOString(),
      uhNumero,
      atoreNome: atorNome,
      atoreRole: "SISTEMA",
      extra: payload,
    });
  }

  // ── Filtrar por tipo ────────────────────────────────────────────────────────
  const filtrados = tipoParam ? eventos.filter((e) => e.tipo === tipoParam) : eventos;

  // ── Ordenar por timestamp desc ──────────────────────────────────────────────
  filtrados.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return NextResponse.json(filtrados);
}
