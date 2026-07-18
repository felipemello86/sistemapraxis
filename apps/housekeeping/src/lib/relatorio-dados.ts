import { prisma } from "@praxis/core";
import { format } from "date-fns";
import { calcularScoreUH } from "./scoring";

// Portado de apps/housekeeping/src/lib/relatorio-dados.ts (v1). hotelId →
// tenantId; model Hotel → Tenant (nome → name). `foto` vem de User.foto
// (Cadastro de Usuários no gateway). Preservado o mesmo comportamento do
// v1: o score aqui NÃO usa o targetMinutes configurado no HkConfig do
// tenant (diferente de /api/scores) — sempre usa o default de
// calcularScoreUH (25min). Não é um ajuste desta migração, é assim que já
// era no v1.

// ── Timezone helper (servidor roda UTC, Brasil = UTC-3) ───────────────────────
function fmtHora(date: Date | null | undefined): string | null {
  if (!date) return null;
  const brt = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return format(brt, "HH:mm");
}
function fmtDataHora(date: Date): string {
  const brt = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return format(brt, "dd/MM/yyyy HH:mm");
}

export type RelatorioData = {
  hotel: { nome: string };
  data: string;
  geradoEm: string;
  geral: {
    totalUHs: number;
    inicioGeral: string | null;
    fimGeral: string | null;
    mediaDeslocamentoSegundos: number | null;
    totalFalhasCamareiras: number;
    totalFalhasGerenciais: number;
    uhsManutencao: { numero: string; descricao: string | null }[];
  };
  linhasUH: Array<{
    numero: string;
    emManutencao: boolean;
    camareira: string;
    liberadaEm: string | null;
    inicioLimpeza: string | null;
    fimLimpeza: string | null;
    duracaoSegundos: number | null;
    checkInLiberadoEm: string | null;
    falhasCamareira: number;
    falhasGerenciais: number;
    falhas: string[];
    observacaoGovernanta: string | null;
  }>;
  camareiras: Array<{
    nome: string;
    foto: string | null;
    totalUHs: number;
    mediaScore: number | null;
    mediaLimpezaSegundos: number | null;
    totalFalhas: number;
    totalFalhasGerenciais: number;
    mediaDeslocamentoSegundos: number | null;
  }>;
  camareirasDoMes: Array<{
    nome: string;
    foto: string | null;
    totalUHs: number;
    mediaScore: number | null;
    mediaLimpezaSegundos: number | null;
    totalFalhas: number;
  }>;
  etapas: Array<{
    nome: string;
    mediaSegundos: number;
    contagem: number;
  }>;
  etapasPorCamareira: {
    nomes: string[]; // primeiros nomes, mesma ordem de camareiras[]
    etapas: Array<{
      nome: string;
      tempos: (number | null)[]; // index corresponde a nomes[]
    }>;
  };
  burndown: {
    linhas: Array<{
      numero: string;
      camareira: string;
      liberadaEm: string | null;
      inicioLimpeza: string | null;
      fimLimpeza: string | null;
      fimInspecao: string | null;
      esperaSegundos: number | null;
      inspecaoSegundos: number | null;
    }>;
    // Pontos para o gráfico: minutos desde 08:00 → UHs restantes
    eventos: Array<{ minutos: number; uhsRestantes: number }>;
    totalMinutos: number; // range do eixo X
  };
  falhasLavanderia: Array<{
    uhNumero: string;
    descricao: string;
    reportadoPorNome: string;
    reportadoPorRole: string;
    hora: string | null;
  }>;
};

// Etapas que não devem aparecer no relatório
const ETAPAS_EXCLUIDAS = ["Limpeza concluída", "Início da limpeza completa"];

export async function getRelatorioData(tenantId: string, data: string): Promise<RelatorioData> {
  const mesInicio = data.slice(0, 7) + "-01"; // "YYYY-MM-01"
  const mesFimDate = new Date(data.slice(0, 4) + "-" + data.slice(5, 7) + "-01");
  mesFimDate.setMonth(mesFimDate.getMonth() + 1);
  mesFimDate.setDate(mesFimDate.getDate() - 1);
  const mesFim = format(mesFimDate, "yyyy-MM-dd");

  const [tenant, assignments, selecoes, falhasLavRaw, assignmentsMes] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    prisma.dailyAssignment.findMany({
      where: { tenantId, data },
      include: {
        uh: { select: { numero: true, emManutencao: true, manutencaoDescricao: true } },
        camareira: { select: { id: true, nome: true, foto: true } },
        program: { select: { tipo: true } },
        cleaningSession: {
          include: {
            steps: { include: { step: { select: { titulo: true, ordem: true } } } },
            inspection: {
              include: {
                itens: { select: { item: true, resultado: true, tipoFalha: true, observacao: true } },
              },
            },
          },
        },
      },
      // relationJoins ligado no schema compartilhado (ver comentário no
      // generator, packages/core/prisma/schema.prisma) — essa é a query mais
      // pesada da suíte (5 níveis de relação aninhada), então é onde o join
      // mais compensa: colapsa várias idas ao banco numa única query.
      relationLoadStrategy: "join",
    }),
    prisma.dailyUHSelection.findMany({
      where: { tenantId, data },
      select: { uhId: true, liberadaEm: true },
    }),
    prisma.falhaLavanderia.findMany({
      where: { tenantId, data },
      orderBy: { createdAt: "asc" },
      select: { uhNumero: true, descricao: true, reportadoPorNome: true, reportadoPorRole: true, createdAt: true },
    }),
    prisma.dailyAssignment.findMany({
      where: { tenantId, data: { gte: mesInicio, lte: mesFim } },
      include: {
        camareira: { select: { id: true, nome: true, foto: true } },
        program: { select: { tipo: true } },
        cleaningSession: { select: { duracaoSegundos: true, excluidoDoScore: true, inspection: { select: { totalFalhas: true } } } },
      },
      relationLoadStrategy: "join",
    }),
  ]);

  const hotelNome = tenant?.name ?? "Hotel";
  const libPorUh = new Map(selecoes.map((s) => [s.uhId, s.liberadaEm]));
  assignments.sort((a, b) => a.uh.numero.localeCompare(b.uh.numero, undefined, { numeric: true }));

  const totalUHs = assignments.length;

  // ── Info geral ────────────────────────────────────────────────────────────────
  const inicios = assignments.map((a) => a.cleaningSession?.iniciadaEm).filter(Boolean) as Date[];
  const fins = assignments.map((a) => a.cleaningSession?.inspection?.finalizadaEm).filter(Boolean) as Date[];

  const inicioGeral = inicios.length > 0
    ? fmtHora(new Date(Math.min(...inicios.map((d) => d.getTime())))) : null;
  const fimGeral = fins.length > 0
    ? fmtHora(new Date(Math.max(...fins.map((d) => d.getTime())))) : null;

  const totalFalhasCamareiras = assignments.reduce(
    (s, a) => s + (a.cleaningSession?.inspection?.totalFalhas ?? 0), 0);
  const totalFalhasGerenciais = assignments.reduce(
    (s, a) => s + (a.cleaningSession?.inspection?.totalFalhasGerenciais ?? 0), 0);
  const uhsManutencao = assignments
    .filter((a) => a.uh.emManutencao)
    .map((a) => ({ numero: a.uh.numero, descricao: a.uh.manutencaoDescricao ?? null }));

  // ── Deslocamento por camareira ────────────────────────────────────────────────
  const sessoesPorCam = new Map<string, { inicio: Date; fim: Date }[]>();
  for (const a of assignments) {
    const cs = a.cleaningSession;
    if (!cs?.iniciadaEm || !cs?.finalizadaEm) continue;
    if (!sessoesPorCam.has(a.camareiraId)) sessoesPorCam.set(a.camareiraId, []);
    sessoesPorCam.get(a.camareiraId)!.push({ inicio: cs.iniciadaEm, fim: cs.finalizadaEm });
  }
  const deslocPorCam = new Map<string, number | null>();
  for (const [camId, sessoes] of sessoesPorCam.entries()) {
    sessoes.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
    const gaps: number[] = [];
    for (let i = 1; i < sessoes.length; i++) {
      const gap = Math.round((sessoes[i].inicio.getTime() - sessoes[i - 1].fim.getTime()) / 1000);
      if (gap >= 0) gaps.push(gap);
    }
    deslocPorCam.set(camId, gaps.length > 0 ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : null);
  }
  const allGaps = [...deslocPorCam.values()].filter((v): v is number => v !== null);
  const mediaDeslocamentoSegundos = allGaps.length > 0
    ? Math.round(allGaps.reduce((s, g) => s + g, 0) / allGaps.length) : null;

  // ── Linhas UH ────────────────────────────────────────────────────────────────
  const linhasUH = assignments.map((a) => {
    const cs = a.cleaningSession;
    const insp = cs?.inspection;
    const lib = libPorUh.get(a.uhId);
    // Só falhas de camareira nas descrições
    const falhasCamDesc = insp?.itens
      .filter((i) => i.resultado === "FALHA" && i.tipoFalha !== "GERENCIAL")
      .map((i) => `${i.item}${i.observacao ? ` (${i.observacao})` : ""}`) ?? [];
    return {
      numero: a.uh.numero,
      emManutencao: a.uh.emManutencao,
      camareira: a.camareira.nome.split(" ")[0],
      liberadaEm: lib ? fmtHora(lib) : null,
      inicioLimpeza: fmtHora(cs?.iniciadaEm),
      fimLimpeza: fmtHora(cs?.finalizadaEm),
      duracaoSegundos: cs?.duracaoSegundos ?? null,
      checkInLiberadoEm: fmtHora(insp?.finalizadaEm),
      falhasCamareira: insp?.totalFalhas ?? 0,
      falhasGerenciais: insp?.totalFalhasGerenciais ?? 0,
      falhas: falhasCamDesc,
      observacaoGovernanta: insp?.comentarioGovernanta ?? null,
    };
  });

  // ── Camareiras ───────────────────────────────────────────────────────────────
  const camMap = new Map<string, { nome: string; foto: string | null; uhs: typeof assignments }>();
  for (const a of assignments) {
    if (!camMap.has(a.camareiraId)) camMap.set(a.camareiraId, { nome: a.camareira.nome, foto: a.camareira.foto, uhs: [] });
    camMap.get(a.camareiraId)!.uhs.push(a);
  }
  const camareiras = Array.from(camMap.entries()).map(([camId, { nome, foto, uhs }]) => {
    const scores: number[] = [];
    let totalFalhas = 0, totalFalhasGer = 0;
    const duracoes: number[] = [];
    for (const a of uhs) {
      // Performance: só Arrumação Padrão e não excluídas do score
      if (a.program?.tipo !== "ARRUMACAO") continue;
      const cs = a.cleaningSession;
      if (!cs?.duracaoSegundos || cs.excluidoDoScore) continue;
      const f = cs.inspection?.totalFalhas ?? 0;
      totalFalhas += f;
      totalFalhasGer += cs.inspection?.totalFalhasGerenciais ?? 0;
      scores.push(calcularScoreUH(cs.duracaoSegundos, f));
      duracoes.push(cs.duracaoSegundos);
    }
    return {
      nome,
      foto,
      totalUHs: scores.length,
      mediaScore: scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length * 10) / 10 : null,
      mediaLimpezaSegundos: duracoes.length > 0 ? Math.round(duracoes.reduce((s, v) => s + v, 0) / duracoes.length) : null,
      totalFalhas,
      totalFalhasGerenciais: totalFalhasGer,
      mediaDeslocamentoSegundos: deslocPorCam.get(camId) ?? null,
    };
  }).sort((a, b) => (b.mediaScore ?? 0) - (a.mediaScore ?? 0));

  // ── Scores do mês ─────────────────────────────────────────────────────────────
  const camMesMap = new Map<string, { nome: string; foto: string | null; scores: number[]; duracoes: number[]; falhas: number }>();
  for (const a of assignmentsMes) {
    if (a.program?.tipo !== "ARRUMACAO") continue;
    const cs = a.cleaningSession;
    if (!cs?.duracaoSegundos || cs.excluidoDoScore) continue;
    if (!camMesMap.has(a.camareiraId)) {
      camMesMap.set(a.camareiraId, { nome: a.camareira.nome, foto: a.camareira.foto, scores: [], duracoes: [], falhas: 0 });
    }
    const f = cs.inspection?.totalFalhas ?? 0;
    const entry = camMesMap.get(a.camareiraId)!;
    entry.scores.push(calcularScoreUH(cs.duracaoSegundos, f));
    entry.duracoes.push(cs.duracaoSegundos);
    entry.falhas += f;
  }
  const camareirasDoMes = Array.from(camMesMap.values())
    .map(({ nome, foto, scores, duracoes, falhas }) => ({
      nome,
      foto,
      totalUHs: scores.length,
      mediaScore: scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length * 10) / 10 : null,
      mediaLimpezaSegundos: duracoes.length > 0 ? Math.round(duracoes.reduce((s, v) => s + v, 0) / duracoes.length) : null,
      totalFalhas: falhas,
    }))
    .sort((a, b) => (b.mediaScore ?? 0) - (a.mediaScore ?? 0));

  // ── Etapas (excluindo etapas de marcação) ────────────────────────────────────
  const stepMap = new Map<string, { total: number; count: number; ordem: number }>();
  for (const a of assignments) {
    if (a.program?.tipo !== "ARRUMACAO") continue; // só Arrumação Padrão
    if (a.cleaningSession?.excluidoDoScore) continue; // excluídas manualmente
    for (const ss of a.cleaningSession?.steps ?? []) {
      if (!ss.duracaoSegundos) continue;
      if (ETAPAS_EXCLUIDAS.includes(ss.step.titulo)) continue;
      const key = ss.step.titulo;
      if (!stepMap.has(key)) stepMap.set(key, { total: 0, count: 0, ordem: ss.step.ordem });
      const e = stepMap.get(key)!;
      e.total += ss.duracaoSegundos;
      e.count += 1;
    }
  }
  const etapas = Array.from(stepMap.entries())
    .map(([nome, { total, count, ordem }]) => ({ nome, mediaSegundos: Math.round(total / count), contagem: count, ordem }))
    .sort((a, b) => a.ordem - b.ordem)
    .map(({ nome, mediaSegundos, contagem }) => ({ nome, mediaSegundos, contagem }));

  // ── Etapas por camareira ──────────────────────────────────────────────────────
  const stepCamMap = new Map<string, Map<string, { total: number; count: number }>>();
  for (const a of assignments) {
    if (a.program?.tipo !== "ARRUMACAO") continue; // só Arrumação Padrão
    if (a.cleaningSession?.excluidoDoScore) continue; // excluídas manualmente
    const camNome = a.camareira.nome.split(" ")[0];
    for (const ss of a.cleaningSession?.steps ?? []) {
      if (!ss.duracaoSegundos) continue;
      if (ETAPAS_EXCLUIDAS.includes(ss.step.titulo)) continue;
      const titulo = ss.step.titulo;
      if (!stepCamMap.has(titulo)) stepCamMap.set(titulo, new Map());
      const byCam = stepCamMap.get(titulo)!;
      if (!byCam.has(camNome)) byCam.set(camNome, { total: 0, count: 0 });
      const entry = byCam.get(camNome)!;
      entry.total += ss.duracaoSegundos;
      entry.count++;
    }
  }
  const camNomesOrdered = camareiras.map((c) => c.nome.split(" ")[0]);
  const etapasPorCamareira = {
    nomes: camNomesOrdered,
    etapas: etapas.map((e) => ({
      nome: e.nome,
      tempos: camNomesOrdered.map((nomeCam) => {
        const d = stepCamMap.get(e.nome)?.get(nomeCam);
        return d ? Math.round(d.total / d.count) : null;
      }),
    })),
  };

  // ── Burndown ──────────────────────────────────────────────────────────────────
  // Referência: 08:00 BRT = 11:00 UTC (Brasil = UTC-3)
  const day8amMs = new Date(`${data}T11:00:00.000Z`).getTime();
  const cEvents = assignments
    .filter((a) => a.cleaningSession?.inspection?.finalizadaEm)
    .map((a) => a.cleaningSession!.inspection!.finalizadaEm!.getTime())
    .sort((a, b) => a - b);

  const burndownEventos: { minutos: number; uhsRestantes: number }[] = [
    { minutos: 0, uhsRestantes: totalUHs },
  ];
  let restantes = totalUHs;
  for (const ts of cEvents) {
    restantes--;
    burndownEventos.push({ minutos: Math.max(0, Math.round((ts - day8amMs) / 60000)), uhsRestantes: restantes });
  }
  const totalMinutos = cEvents.length > 0
    ? Math.ceil((Math.max(...cEvents) - day8amMs) / 60000) + 30
    : 600;

  const burndownLinhas = assignments
    .map((a) => {
      const lib = libPorUh.get(a.uhId);
      const cs = a.cleaningSession;
      const insp = cs?.inspection;
      const esperaSegundos = lib && cs?.iniciadaEm
        ? Math.max(0, Math.round((cs.iniciadaEm.getTime() - lib.getTime()) / 1000))
        : null;
      const inspecaoSegundos = cs?.finalizadaEm && insp?.finalizadaEm
        ? Math.max(0, Math.round((insp.finalizadaEm.getTime() - cs.finalizadaEm.getTime()) / 1000))
        : null;
      return {
        numero: a.uh.numero,
        camareira: a.camareira.nome.split(" ")[0],
        liberadaEm: lib ? fmtHora(lib) : null,
        inicioLimpeza: fmtHora(cs?.iniciadaEm),
        fimLimpeza: fmtHora(cs?.finalizadaEm),
        fimInspecao: fmtHora(insp?.finalizadaEm),
        esperaSegundos,
        inspecaoSegundos,
        _sort: lib?.getTime() ?? Infinity,
      };
    })
    .sort((a, b) => a._sort - b._sort)
    .map(({ _sort, ...rest }) => rest);

  return {
    hotel: { nome: hotelNome },
    data: format(new Date(`${data}T12:00:00`), "dd/MM/yyyy"),
    geradoEm: fmtDataHora(new Date()),
    geral: { totalUHs, inicioGeral, fimGeral, mediaDeslocamentoSegundos, totalFalhasCamareiras, totalFalhasGerenciais, uhsManutencao },
    linhasUH,
    camareiras,
    camareirasDoMes,
    etapas,
    etapasPorCamareira,
    burndown: { linhas: burndownLinhas, eventos: burndownEventos, totalMinutos },
    falhasLavanderia: falhasLavRaw.map((f) => ({
      uhNumero: f.uhNumero,
      descricao: f.descricao,
      reportadoPorNome: f.reportadoPorNome,
      reportadoPorRole: f.reportadoPorRole,
      hora: fmtHora(f.createdAt),
    })),
  };
}
