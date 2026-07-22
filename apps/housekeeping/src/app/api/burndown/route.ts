import { NextRequest, NextResponse } from "next/server";
import { getSession, prisma } from "@praxis/core";
import { liberarLateCheckoutsVencidos } from "@/lib/late-checkout";
import { dataAtualSP } from "@/lib/timezone";

// Portado de apps/housekeeping/src/app/api/burndown/route.ts (v1).
// Alimenta o dashboard "Tempo Real" (BurndownChart) — a tela mais valiosa
// do v1 segundo o Felipe, então prioridade sobre o resto do que falta portar.
//
// Diferenças conscientes desta fatia:
//   - hotelId → tenantId (schema único v2).
//   - `atorFoto`/`foto` vêm de User.foto (ver packages/core/prisma/schema.prisma)
//     quando o ator é a camareira ou a governanta que inspecionou; a
//     liberação ("L") é atribuída por nome livre (liberadoPorNome, não é FK
//     de User), então continua sem foto — o frontend já cai pra iniciais.
//   - Não existe tabela de "evento"/log dedicada em nenhuma das duas versões:
//     a timeline é derivada em memória a partir de DailyUHSelection,
//     CleaningSession e InspectionSession, exatamente como no v1.

export type BurndownEvento = {
  tipo: "L" | "I" | "T" | "C";
  timestamp: string;
  uhNumero: string;
  emManutencao: boolean;
  atorNome: string;
  atorFoto: string | null;
  duracaoSegundos?: number | null;
  valor: number; // % restante APÓS este evento (global)
  camareiraId?: string; // preenchido em I, T e C
};

export type DeslocamentoCamareira = {
  camareiraId: string;
  nome: string;
  foto: string | null;
  totalUHs: number;
  mediaLimpezaSegundos: number | null;
  mediaDeslocamentoSegundos: number | null;
  countDeslocamentos: number;
};

export type BurndownData = {
  totalUHs: number;
  concluidas: number;
  eventos: BurndownEvento[];
  deslocamentos: DeslocamentoCamareira[];
  globalStats: {
    mediaLimpezaSegundos: number | null;
    mediaDeslocamentoSegundos: number | null;
  };
};

// GET /api/burndown?data=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Leitura sempre liberada, mesmo sem acesso ao módulo (ver comentário em
  // apps/maintenance/src/app/page.tsx) — esta rota é só de leitura. Era
  // aqui que a tela "Tempo Real" ficava vazia/com erro pra quem não tinha
  // acesso, mesmo depois de liberar a página em si (ver dashboard/page.tsx).
  const tenantId = session.tenantId;

  // Tela mais acessada/atualizada do módulo (poll a cada 60s no cliente) —
  // aproveitada como um dos gatilhos best-effort da liberação automática de
  // Late Check-out (ver lib/late-checkout.ts).
  try {
    await liberarLateCheckoutsVencidos(tenantId);
  } catch (e) {
    console.error("[late-checkout] falha ao liberar automaticamente:", e);
  }

  const data = req.nextUrl.searchParams.get("data") || dataAtualSP();

  const assignments = await prisma.dailyAssignment.findMany({
    where: { tenantId, data },
    include: {
      uh: { select: { numero: true, emManutencao: true } },
      camareira: { select: { nome: true, foto: true } },
      cleaningSession: {
        include: {
          inspection: {
            select: {
              finalizadaEm: true,
              governanta: { select: { nome: true, foto: true } },
            },
          },
        },
      },
    },
    // relationJoins ligado no schema compartilhado (ver
    // packages/core/prisma/schema.prisma) — essa tela é a mais consultada
    // (polling do dashboard "Tempo Real"), então o join reduz bastante o
    // número de idas ao banco por requisição.
    relationLoadStrategy: "join",
  });

  const selecoes = await prisma.dailyUHSelection.findMany({
    where: { tenantId, data, liberada: true, liberadaEm: { not: null } },
    select: { uhId: true, liberadaEm: true, liberadoPorNome: true, uh: { select: { numero: true } } },
  });

  const totalUHs = assignments.length;
  if (totalUHs === 0) {
    return NextResponse.json({
      totalUHs: 0, concluidas: 0, eventos: [], deslocamentos: [],
      globalStats: { mediaLimpezaSegundos: null, mediaDeslocamentoSegundos: null },
    });
  }

  // Mapa uhId → camareiraId para associar liberação à camareira
  const uhCamMap = new Map(assignments.map((a) => [a.uhId, a.camareiraId]));
  // Mapa uhId → emManutencao para liberações
  const uhManutencaoMap = new Map(assignments.map((a) => [a.uhId, a.uh.emManutencao]));

  type RawEvento = {
    tipo: "L" | "I" | "T" | "C";
    timestamp: Date;
    uhNumero: string;
    emManutencao: boolean;
    atorNome: string;
    atorFoto: string | null;
    duracaoSegundos?: number | null;
    camareiraId?: string;
  };

  const raw: RawEvento[] = [];

  // L — Liberação: usa quem realmente liberou + camareiraId da UH
  for (const sel of selecoes) {
    if (!sel.liberadaEm) continue;
    const nome = sel.liberadoPorNome ?? "Gerência";
    const camareiraId = uhCamMap.get(sel.uhId);
    raw.push({
      tipo: "L",
      timestamp: sel.liberadaEm,
      uhNumero: sel.uh.numero,
      emManutencao: uhManutencaoMap.get(sel.uhId) ?? false,
      atorNome: nome,
      atorFoto: null,
      ...(camareiraId ? { camareiraId } : {}),
    });
  }

  // I, T, C — da sessão
  for (const a of assignments) {
    const cs = a.cleaningSession;
    if (!cs) continue;

    if (cs.iniciadaEm) {
      raw.push({
        tipo: "I",
        timestamp: cs.iniciadaEm,
        uhNumero: a.uh.numero,
        emManutencao: a.uh.emManutencao,
        atorNome: a.camareira.nome,
        atorFoto: a.camareira.foto,
        camareiraId: a.camareiraId,
      });
    }
    if (cs.finalizadaEm) {
      raw.push({
        tipo: "T",
        timestamp: cs.finalizadaEm,
        uhNumero: a.uh.numero,
        emManutencao: a.uh.emManutencao,
        atorNome: a.camareira.nome,
        atorFoto: a.camareira.foto,
        duracaoSegundos: cs.duracaoSegundos,
        camareiraId: a.camareiraId,
      });
    }
    // C — inclui camareiraId para filtro por camareira
    if (cs.inspection?.finalizadaEm) {
      raw.push({
        tipo: "C",
        timestamp: cs.inspection.finalizadaEm,
        uhNumero: a.uh.numero,
        emManutencao: a.uh.emManutencao,
        atorNome: cs.inspection.governanta?.nome ?? "Governanta",
        atorFoto: cs.inspection.governanta?.foto ?? null,
        camareiraId: a.camareiraId,
      });
    }
  }

  raw.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  let concluidas = 0;
  const eventos: BurndownEvento[] = raw.map((ev) => {
    if (ev.tipo === "C") concluidas++;
    const valor = Math.round(((totalUHs - concluidas) / totalUHs) * 100);
    return {
      tipo: ev.tipo,
      timestamp: ev.timestamp.toISOString(),
      uhNumero: ev.uhNumero,
      emManutencao: ev.emManutencao,
      atorNome: ev.atorNome,
      atorFoto: ev.atorFoto,
      duracaoSegundos: ev.duracaoSegundos,
      valor,
      ...(ev.camareiraId ? { camareiraId: ev.camareiraId } : {}),
    };
  });

  // ── Estatísticas por camareira ────────────────────────────────────────────
  const byCamareira: Record<string, typeof assignments> = {};
  for (const a of assignments) {
    if (!byCamareira[a.camareiraId]) byCamareira[a.camareiraId] = [];
    byCamareira[a.camareiraId].push(a);
  }

  const deslocamentos: DeslocamentoCamareira[] = Object.entries(byCamareira).map(([camId, cams]) => {
    const nome = cams[0].camareira.nome;
    const totalUHsCam = cams.length;

    // Média de tempo de limpeza
    const duracoes = cams
      .filter((a) => a.cleaningSession?.duracaoSegundos != null)
      .map((a) => a.cleaningSession!.duracaoSegundos!);
    const mediaLimpezaSegundos =
      duracoes.length > 0
        ? Math.round(duracoes.reduce((acc, d) => acc + d, 0) / duracoes.length)
        : null;

    // Média de deslocamento (intervalo entre finalizadaEm[N] e iniciadaEm[N+1])
    const sessoes = cams
      .filter((a) => a.cleaningSession?.iniciadaEm && a.cleaningSession?.finalizadaEm)
      .map((a) => ({
        iniciadaEm: a.cleaningSession!.iniciadaEm!,
        finalizadaEm: a.cleaningSession!.finalizadaEm!,
      }))
      .sort((a, b) => a.iniciadaEm.getTime() - b.iniciadaEm.getTime());

    const gaps: number[] = [];
    for (let i = 1; i < sessoes.length; i++) {
      const gap = Math.round(
        (sessoes[i].iniciadaEm.getTime() - sessoes[i - 1].finalizadaEm.getTime()) / 1000
      );
      if (gap >= 0) gaps.push(gap);
    }
    const mediaDeslocamentoSegundos =
      gaps.length > 0 ? Math.round(gaps.reduce((acc, g) => acc + g, 0) / gaps.length) : null;

    return { camareiraId: camId, nome, foto: cams[0].camareira.foto, totalUHs: totalUHsCam, mediaLimpezaSegundos, mediaDeslocamentoSegundos, countDeslocamentos: gaps.length };
  });

  deslocamentos.sort((a, b) => a.nome.localeCompare(b.nome));

  // ── Estatísticas globais ──────────────────────────────────────────────────
  const allDuracoes = assignments
    .filter((a) => a.cleaningSession?.duracaoSegundos != null)
    .map((a) => a.cleaningSession!.duracaoSegundos!);
  const globalMediaLimpeza =
    allDuracoes.length > 0
      ? Math.round(allDuracoes.reduce((a, b) => a + b, 0) / allDuracoes.length)
      : null;

  const camsComDesloc = deslocamentos.filter((d) => d.mediaDeslocamentoSegundos !== null);
  const globalMediaDesloc =
    camsComDesloc.length > 0
      ? Math.round(
          camsComDesloc.reduce((s, d) => s + d.mediaDeslocamentoSegundos!, 0) / camsComDesloc.length
        )
      : null;

  return NextResponse.json({
    totalUHs,
    concluidas,
    eventos,
    deslocamentos,
    globalStats: { mediaLimpezaSegundos: globalMediaLimpeza, mediaDeslocamentoSegundos: globalMediaDesloc },
  } satisfies BurndownData);
}
