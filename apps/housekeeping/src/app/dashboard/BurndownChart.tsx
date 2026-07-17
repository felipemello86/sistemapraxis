"use client";
import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, ReferenceLine, Customized,
} from "recharts";
import { ChevronLeft, ChevronRight, Flag, Timer, ArrowLeftRight, Send } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// Portado de apps/housekeeping/src/app/dashboard/BurndownChart.tsx (v1).
// Diferenças conscientes desta fatia:
//   - `role` chega via prop (não next-auth useSession) — mesmo padrão das
//     outras views portadas nesta reconstrução.
//   - fetch("/api/burndown...") → apiFetch(...) (basePath do módulo).
//   - Botão "Enviar Relatório" (Telegram, /api/relatorio-diario) reintroduzido
//     junto com o porte do bloco Relatórios (gera PDF + envia via Telegram
//     pra quem tem telegramChatId cadastrado).
//   - `atorFoto`/`foto` sempre chegam `null` da API v2 (User v2 não tem
//     campo foto) — o componente já cai pra iniciais nesse caso, sem
//     mudança de lógica necessária.

// ── Types ────────────────────────────────────────────────────────────────────
type Evento = {
  tipo: "L" | "I" | "T" | "C";
  timestamp: string;
  uhNumero: string;
  emManutencao?: boolean;
  atorNome: string;
  atorFoto: string | null;
  duracaoSegundos?: number | null;
  valor: number;
  isPhantom?: boolean;
  x?: number;
  camareiraId?: string;
  isMerged?: boolean;
  mergedUhs?: string[];
  mergedCount?: number;
};

type DeslocamentoCamareira = {
  camareiraId: string;
  nome: string;
  foto: string | null;
  totalUHs: number;
  mediaLimpezaSegundos: number | null;
  mediaDeslocamentoSegundos: number | null;
  countDeslocamentos: number;
};

type BurndownData = {
  totalUHs: number;
  concluidas: number;
  eventos: Evento[];
  deslocamentos: DeslocamentoCamareira[];
  globalStats: { mediaLimpezaSegundos: number | null; mediaDeslocamentoSegundos: number | null };
};

// ── Constantes ───────────────────────────────────────────────────────────────
const TIPO_COR: Record<string, string> = {
  L: "#3b82f6", I: "#f59e0b", T: "#8b5cf6", C: "#10b981",
};
const TIPO_LABEL: Record<string, string> = {
  L: "Liberação", I: "Início limpeza", T: "Término limpeza", C: "Check-in liberado",
};
const TIPO_SUBTITULO: Record<string, string> = {
  L: "Liberada para limpeza", I: "Limpeza iniciada", T: "Limpeza concluída", C: "Liberada para check-in",
};

const GLOBAL_COR = "#6366f1";
// Paleta para camareiras — ordem estável por índice
const CAM_PALETTE = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#ec4899", "#a855f7"];

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatDur(seg: number) {
  const m = Math.floor(seg / 60), s = seg % 60;
  return s > 0 ? `${m}min ${s}s` : `${m}min`;
}
function formatMin(seg: number | null) {
  if (seg === null) return "—";
  if (seg < 60) return `${seg}s`;
  const m = Math.floor(seg / 60), s = seg % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}min`;
}

// ── Balloon SVG ──────────────────────────────────────────────────────────────
function Balloon({ cx, cy, point, flipDown = false, corOverride }: {
  cx: number; cy: number; point: Evento; flipDown?: boolean; corOverride?: string;
}) {
  const cor = corOverride ?? (TIPO_COR[point.tipo] || "#6b7280");
  const nome = point.atorNome;
  const foto = point.atorFoto;
  const concluido = 100 - point.valor;

  const isMerged = point.isMerged;
  const count = point.mergedCount ?? 1;
  const mergedUhsList = point.mergedUhs ?? [];

  let linha1: string, linha2: string, linha3: string, linha4: string;
  if (isMerged) {
    linha1 = `L · ${count} UH${count > 1 ? "s" : ""} liberada${count > 1 ? "s" : ""}`;
    linha2 = "Liberadas antes das 08:00";
    const uhsExibidas = mergedUhsList.slice(0, 5).join(" · ");
    linha3 = mergedUhsList.length > 5 ? `${uhsExibidas} +${mergedUhsList.length - 5}` : uhsExibidas;
    linha4 = `${nome}  ·  ${concluido}% concluído`;
  } else {
    const hora = format(new Date(point.timestamp || Date.now()), "HH:mm");
    linha1 = `${point.tipo}  ·  UH ${point.uhNumero}`;
    linha2 = TIPO_SUBTITULO[point.tipo] || point.tipo;
    linha3 = nome;
    linha4 = point.tipo === "T" && point.duracaoSegundos
      ? `${formatDur(point.duracaoSegundos)}  ·  ${hora}  ·  ${concluido}% concluído`
      : `${hora}  ·  ${concluido}% concluído`;
  }

  const AV = 42, PAD = 10, TEXTO_X = PAD + AV + PAD;
  const FONT1 = 11, FONT2 = 9.5, FONT3 = 10, FONT4 = 8.5;
  const maxTextW = Math.max(
    linha1.length * FONT1 * 0.6, linha2.length * FONT2 * 0.58,
    linha3.length * FONT3 * 0.6, linha4.length * FONT4 * 0.56,
  );
  const bW = TEXTO_X + maxTextW + PAD;
  const bH = 72, TAIL = 8;
  const bxRaw = cx - bW / 2;
  const bx = Math.max(-48, bxRaw);
  const by = flipDown ? cy + TAIL + 6 : cy - bH - TAIL - 6;
  const clipId = `clip-${Math.round(cx * 10)}-${Math.round(cy * 10)}`;
  const avatarCx = bx + PAD + AV / 2;
  const avatarCy = by + bH / 2;

  return (
    <g style={{ pointerEvents: "none" }}>
      <line x1={cx} y1={flipDown ? cy + 6 : cy - 6} x2={cx} y2={flipDown ? by : by + bH + TAIL}
        stroke={cor} strokeWidth={1.5} strokeDasharray="3 3" opacity={0.5} />
      <rect x={bx + 2} y={by + 2} width={bW} height={bH} rx={8} fill="rgba(0,0,0,0.15)" />
      <rect x={bx} y={by} width={bW} height={bH} rx={8} fill={cor} />
      <rect x={bx} y={by} width={bW} height={22} rx={8} fill="rgba(0,0,0,0.18)" />
      <rect x={bx} y={by + 14} width={bW} height={8} fill="rgba(0,0,0,0.18)" />
      {flipDown
        ? <polygon points={`${cx - 7},${by} ${cx + 7},${by} ${cx},${by - TAIL}`} fill={cor} />
        : <polygon points={`${Math.max(bx + 10, cx - 7)},${by + bH} ${Math.min(bx + bW - 10, cx + 7)},${by + bH} ${cx},${by + bH + TAIL}`} fill={cor} />
      }
      <clipPath id={clipId}><circle cx={avatarCx} cy={avatarCy} r={AV / 2} /></clipPath>
      {foto ? (
        <>
          <circle cx={avatarCx} cy={avatarCy} r={AV / 2 + 2} fill="rgba(255,255,255,0.2)" />
          <image href={foto} x={bx + PAD} y={by + bH / 2 - AV / 2} width={AV} height={AV}
            clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
        </>
      ) : (
        <>
          <circle cx={avatarCx} cy={avatarCy} r={AV / 2} fill="rgba(255,255,255,0.2)" />
          <text x={avatarCx} y={avatarCy} fontSize={14} textAnchor="middle" dominantBaseline="central" fill="white" fontWeight="bold">
            {nome.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()}
          </text>
        </>
      )}
      <text x={TEXTO_X + bx} y={by + 14} fontSize={FONT1} fill="white" fontWeight="bold" dominantBaseline="middle">{linha1}</text>
      <text x={TEXTO_X + bx} y={by + 30} fontSize={FONT2} fill="rgba(255,255,255,0.8)" dominantBaseline="middle">{linha2}</text>
      <text x={TEXTO_X + bx} y={by + 46} fontSize={FONT3} fill="white" fontWeight="600" dominantBaseline="middle">{linha3}</text>
      <text x={TEXTO_X + bx} y={by + 61} fontSize={FONT4} fill="rgba(255,255,255,0.75)" dominantBaseline="middle">{linha4}</text>
    </g>
  );
}

// ── Dot layer multi-série ─────────────────────────────────────────────────────
type CamSerie = { pts: Evento[]; cor: string; camId: string };
type HoveredDot = { key: string; pt: Evento; cor: string };

function dotKey(pt: Evento) {
  return `${pt.tipo}-${pt.uhNumero}-${pt.timestamp}-${pt.camareiraId ?? ""}`;
}

function MultiDotLayer(props: any) {
  const { xAxisMap, yAxisMap, globalPts, showGlobal, camSeries, hoveredDot, setHoveredDot, filteredUH } = props;
  const xScale = (Object.values(xAxisMap as Record<string, any>)[0] as any)?.scale;
  const yScale = (Object.values(yAxisMap as Record<string, any>)[0] as any)?.scale;
  if (!xScale || !yScale) return null;

  const renderDot = (pt: Evento, i: number, cor: string, serieKey: string) => {
    if (pt.isPhantom || !pt.tipo) return null;
    if (filteredUH && pt.uhNumero !== filteredUH) return null;
    const cx = xScale(pt.x ?? 0);
    const cy = yScale(pt.valor);
    const key = dotKey(pt);
    const isHovered = hoveredDot?.key === key;
    // Dot usa cor do tipo; balloon usa cor da camareira/série
    const dotCor = TIPO_COR[pt.tipo] || cor;

    return (
      <g key={`${serieKey}-${i}`}>
        <circle cx={cx} cy={cy} r={isHovered ? 7 : 5} fill={dotCor} stroke="white" strokeWidth={isHovered ? 2.5 : 1.5} />
        {/* Área de hit invisível — maior para facilitar hover */}
        <circle cx={cx} cy={cy} r={11} fill="transparent"
          onMouseEnter={() => setHoveredDot?.({ key, pt, cor })}
          onMouseLeave={() => setHoveredDot?.(null)}
          style={{ cursor: "pointer" }}
        />
        {isHovered && pt.timestamp && (
          <Balloon cx={cx} cy={cy} point={pt} flipDown={cy < 90} corOverride={cor} />
        )}
      </g>
    );
  };

  return (
    <>
      {/* Dots das camareiras (abaixo dos globais) */}
      {(camSeries as CamSerie[]).map(({ pts, cor }, si) =>
        pts.map((pt, i) => renderDot(pt, i, cor, `cs${si}`))
      )}
      {/* Dots globais */}
      {showGlobal && (globalPts as Evento[]).map((pt, i) => {
        const cor = TIPO_COR[pt.tipo] || "#6b7280";
        return renderDot(pt, i, cor, "gl");
      })}
    </>
  );
}

// ── Computa pts de burndown para uma camareira específica ─────────────────────
function buildCamPts(
  eventos: Evento[],
  camId: string,
  totalUHs: number,
  day8amMs: number,
  isHoje: boolean,
  agoraMin: number,
): Evento[] {
  const toMin = (ts: string) => Math.max(0, Math.round((new Date(ts).getTime() - day8amMs) / 60000));

  const camEvs = eventos
    .filter((e) => e.camareiraId === camId && e.timestamp)
    .map((e) => ({ ...e, x: toMin(e.timestamp) }))
    .sort((a, b) => (a.x ?? 0) - (b.x ?? 0));

  let concluidas = 0;
  const pts: Evento[] = [
    { isPhantom: true, x: 0, valor: 100, tipo: "C", timestamp: "", uhNumero: "", atorNome: "", atorFoto: null },
  ];

  for (const ev of camEvs) {
    if (ev.tipo === "C") concluidas++;
    const valor = Math.round(((totalUHs - concluidas) / totalUHs) * 100);
    pts.push({ ...ev, valor });
  }

  if (concluidas < totalUHs && isHoje) {
    const restante = Math.round(((totalUHs - concluidas) / totalUHs) * 100);
    pts.push({ isPhantom: true, x: agoraMin, valor: restante, tipo: "C", timestamp: "", uhNumero: "", atorNome: "", atorFoto: null });
  }

  return pts;
}

// ── Card de série (Global ou camareira) ──────────────────────────────────────
function SerieCard({
  label, iniciais, foto, cor, ativo, limpeza, deslocamento, progresso, horarioFim, onClick, semFoto = false,
}: {
  label: string; iniciais: string; foto?: string | null; cor: string;
  ativo: boolean; limpeza: number | null; deslocamento: number | null;
  progresso: number; horarioFim?: string | null; onClick: () => void; semFoto?: boolean;
}) {
  const concluido = progresso === 100;
  const GREEN = "#15803d";       // green-700 — texto e borda
  const GREEN_BG = "#16a34a";    // green-600 — fundo quando ativo+concluído

  // 4 estados visuais:
  // ativo + concluído  → fundo verde sólido, texto branco
  // ativo + normal     → fundo cor da série, texto branco
  // inativo + concluído → borda verde, fundo verde-claro, texto normal
  // inativo + normal   → borda cinza, fundo branco
  const bgColor = ativo && concluido ? GREEN_BG : ativo ? cor : concluido ? "#f0fdf4" : undefined;
  const borderColor = concluido ? GREEN : ativo ? cor : undefined;
  const textOnDark = ativo; // fundo escuro → texto branco
  const borderCls = ativo || concluido ? "border-2 shadow-md" : "border bg-white border-gray-200 hover:border-gray-300 hover:shadow";

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 transition-all shadow-sm text-left ${borderCls}`}
      style={{ backgroundColor: bgColor, borderColor }}
    >
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
        style={{ backgroundColor: textOnDark ? "rgba(255,255,255,0.25)" : cor + "25" }}
      >
        {foto ? (
          <img src={foto} alt={label} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs font-bold" style={{ color: textOnDark ? "white" : cor }}>
            {iniciais}
          </span>
        )}
      </div>
      {/* Texto */}
      <div className="flex flex-col items-start leading-none min-w-0">
        <div className="flex items-baseline gap-1 flex-wrap">
          <span className={`text-xs font-semibold truncate max-w-[64px] ${textOnDark ? "text-white" : "text-gray-700"}`}>
            {label}
          </span>
          <span className="text-xs font-bold inline-flex items-center gap-0.5" style={{
            color: textOnDark ? "white" : concluido ? GREEN : cor,
          }}>
            {concluido && horarioFim
              ? <><Flag className="w-3 h-3" />{horarioFim}</>
              : `${progresso}%`}
          </span>
        </div>
        <div className={`flex flex-col text-[11px] mt-0.5 gap-0.5 ${textOnDark ? "text-white/70" : "text-gray-500"}`}>
          <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
            <Timer className="w-3 h-3 shrink-0" />{formatMin(limpeza)}
          </span>
          <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
            <ArrowLeftRight className="w-3 h-3 shrink-0" />{formatMin(deslocamento)}
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function BurndownChart({ role }: { role: string }) {
  const [data, setData] = useState<BurndownData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredDot, setHoveredDot] = useState<HoveredDot | null>(null);
  const [dataSel, setDataSel] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [ativas, setAtivas] = useState<Set<string>>(new Set(["global"]));
  const [expandedLogKey, setExpandedLogKey] = useState<string | null>(null);
  const [filteredUH, setFilteredUH] = useState<string | null>(null);
  const [logFilterCamId, setLogFilterCamId] = useState<string | null>(null);
  const [enviandoRelatorio, setEnviandoRelatorio] = useState(false);
  const [relatorioMsg, setRelatorioMsg] = useState<string | null>(null);
  const isGerente = ["MASTER", "GERENTE"].includes(role);

  // Telas estreitas (mobile): os cards de camareira não cabem sobrepostos no
  // canto do gráfico (viram um amontoado ilegível sobre as linhas). Nesse caso
  // eles saem do modo overlay e passam a ficar em fluxo normal, abaixo do
  // gráfico. Em telas largas mantém o overlay original (economiza espaço vertical).
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const enviarRelatorio = async () => {
    setEnviandoRelatorio(true);
    setRelatorioMsg(null);
    try {
      const res = await apiFetch("/api/relatorio-diario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: dataSel }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao enviar");
      setRelatorioMsg(`✓ Enviado para ${json.enviados} destinatário(s)`);
    } catch (e: any) {
      setRelatorioMsg(`✗ ${e.message}`);
    } finally {
      setEnviandoRelatorio(false);
      setTimeout(() => setRelatorioMsg(null), 5000);
    }
  };

  const hojeStr = new Date().toLocaleDateString("en-CA");
  const isHoje = dataSel === hojeStr;

  const navegarData = (delta: number) => {
    const d = new Date(dataSel + "T12:00:00");
    d.setDate(d.getDate() + delta);
    setDataSel(d.toLocaleDateString("en-CA"));
    setAtivas(new Set(["global"]));
  };

  const toggle = (id: string) => {
    setAtivas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const carregar = useCallback(() => {
    setLoading(true);
    apiFetch(`/api/burndown?data=${dataSel}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, [dataSel]);

  useEffect(() => {
    carregar();
    if (isHoje) {
      const id = setInterval(carregar, 60_000);
      return () => clearInterval(id);
    }
  }, [carregar, isHoje]);

  const dateFmt = format(new Date(dataSel + "T12:00:00"), "dd/MM/yyyy");

  if (loading) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">Carregando...</div>;

  if (!data || data.totalUHs === 0) {
    return (
      <div className="flex flex-col h-full gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => navegarData(-1)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input type="date" value={dataSel} max={hojeStr} onChange={(e) => setDataSel(e.target.value)}
            className="input w-auto text-base py-1.5" />
          <button onClick={() => navegarData(1)} disabled={isHoje}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="card flex flex-col items-center justify-center flex-1 text-gray-400">
          <p className="text-lg font-medium">Nenhuma UH atribuída</p>
          <p className="text-sm mt-1">{dateFmt}</p>
        </div>
      </div>
    );
  }

  const { totalUHs, concluidas, eventos } = data;
  const progresso = Math.round((concluidas / totalUHs) * 100);

  // ── Escala temporal ──────────────────────────────────────────────────────
  const day8amMs = new Date(dataSel + "T08:00:00").getTime();
  const toMin = (ts: string) => Math.round((new Date(ts).getTime() - day8amMs) / 60000);
  const agoraMin = Math.max(0, toMin(new Date().toISOString()));

  // ── Global pts ────────────────────────────────────────────────────────────
  const preLiberacoes = eventos.filter((ev) => ev.tipo === "L" && toMin(ev.timestamp) < 0);
  const preOthers = eventos.filter((ev) => ev.tipo !== "L" && toMin(ev.timestamp) < 0);
  const posEvents = eventos.filter((ev) => toMin(ev.timestamp) >= 0);

  let mergedPre: Evento | null = null;
  if (preLiberacoes.length > 0) {
    const last = preLiberacoes[preLiberacoes.length - 1];
    mergedPre = { ...last, x: 0, isMerged: true, mergedUhs: preLiberacoes.map((e) => e.uhNumero), mergedCount: preLiberacoes.length };
  }

  const restante = 100 - progresso;
  const globalPts: Evento[] = [
    { isPhantom: true, x: 0, valor: 100, tipo: "L", timestamp: dataSel + "T08:00:00.000Z", uhNumero: "", atorNome: "", atorFoto: null },
    ...(mergedPre ? [mergedPre] : []),
    ...preOthers.map((ev) => ({ ...ev, x: 0 })),
    ...posEvents.map((ev) => ({ ...ev, x: toMin(ev.timestamp) })),
    ...(concluidas < totalUHs && isHoje
      ? [{ isPhantom: true, x: agoraMin, valor: restante, tipo: "L" as const, timestamp: new Date().toISOString(), uhNumero: "", atorNome: "", atorFoto: null }]
      : []),
  ];
  // ── Per-camareira pts ─────────────────────────────────────────────────────
  const showGlobal = ativas.has("global");
  const camPtsMap: Record<string, Evento[]> = {};
  for (const d of data.deslocamentos) {
    camPtsMap[d.camareiraId] = buildCamPts(eventos, d.camareiraId, d.totalUHs, day8amMs, isHoje, agoraMin);
  }

  const camCores = Object.fromEntries(
    data.deslocamentos.map((d, i) => [d.camareiraId, CAM_PALETTE[i % CAM_PALETTE.length]])
  );

  const camSeries: CamSerie[] = data.deslocamentos
    .filter((d) => ativas.has(d.camareiraId))
    .map((d) => ({
      pts: camPtsMap[d.camareiraId],
      cor: camCores[d.camareiraId],
      camId: d.camareiraId,
    }));

  // ── Mapa chave→ponto para hover/pin do log ────────────────────────────────
  const dotMap = new Map<string, { pt: Evento; cor: string }>();
  for (const pt of globalPts) {
    if (!pt.isPhantom) dotMap.set(dotKey(pt), { pt, cor: TIPO_COR[pt.tipo] });
  }
  for (const [camId, pts] of Object.entries(camPtsMap)) {
    const cor = camCores[camId];
    for (const pt of pts) {
      if (!pt.isPhantom) {
        const k = dotKey(pt);
        if (dotMap.has(k)) dotMap.set(k, { pt: dotMap.get(k)!.pt, cor });
      }
    }
  }

  // ── Progresso por seleção ─────────────────────────────────────────────────
  const camAtivas = data.deslocamentos.filter((d) => ativas.has(d.camareiraId));
  const useGlobalProgress = showGlobal || camAtivas.length === 0;

  const displayProgress = (() => {
    if (useGlobalProgress) {
      return { pct: progresso, label: "Progresso do dia", detail: `${concluidas} de ${totalUHs} UHs` };
    }
    const totalSel = camAtivas.reduce((s, d) => s + d.totalUHs, 0);
    const concluidasSel = camAtivas.reduce(
      (s, d) => s + eventos.filter((e) => e.camareiraId === d.camareiraId && e.tipo === "T").length,
      0
    );
    const pct = totalSel > 0 ? Math.round((concluidasSel / totalSel) * 100) : 0;
    const nomes = camAtivas.map((d) => d.nome.split(" ")[0]).join(" + ");
    return { pct, label: `Progresso — ${nomes}`, detail: `${concluidasSel} de ${totalSel} UHs` };
  })();

  // ── Eixo X ────────────────────────────────────────────────────────────────
  const allActivePts = [
    ...(showGlobal ? globalPts : []),
    ...camSeries.flatMap((s) => s.pts),
  ];
  const maxEventMin = allActivePts.length > 0 ? Math.max(...allActivePts.map((p) => p.x ?? 0)) : 0;
  const xMax = Math.max(600, Math.ceil(maxEventMin / 30) * 30 + 30);
  const xTicks: number[] = [];
  for (let m = 0; m <= xMax; m += 30) xTicks.push(m);
  const formatXTick = (min: number) => format(new Date(day8amMs + min * 60_000), "HH:mm");

  // Cards de série (Global + por camareira) — reaproveitados tanto no overlay
  // desktop quanto no bloco em fluxo normal do mobile (ver isMobile acima).
  const camCards = (
    <>
      {/* Global */}
      {(() => {
        const ultimoCGlobal = progresso === 100
          ? eventos.filter((e) => e.tipo === "C").reduce<string | null>(
              (latest, e) => !latest || e.timestamp > latest ? e.timestamp : latest, null)
          : null;
        const horarioFimGlobal = ultimoCGlobal ? format(new Date(ultimoCGlobal), "HH:mm") : null;
        return (
          <SerieCard
            label="Global"
            iniciais="G"
            cor={GLOBAL_COR}
            ativo={showGlobal}
            progresso={progresso}
            horarioFim={horarioFimGlobal}
            limpeza={data.globalStats.mediaLimpezaSegundos}
            deslocamento={data.globalStats.mediaDeslocamentoSegundos}
            onClick={() => toggle("global")}
          />
        );
      })()}
      {/* Por camareira */}
      {data.deslocamentos.map((d) => {
        const cor = camCores[d.camareiraId];
        const ativo = ativas.has(d.camareiraId);
        const iniciais = d.nome.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
        const eventosTCam = eventos.filter((e) => e.camareiraId === d.camareiraId && e.tipo === "T");
        const concluidasCam = eventosTCam.length;
        const progrCam = d.totalUHs > 0 ? Math.round((concluidasCam / d.totalUHs) * 100) : 0;
        // Bandeirada individual = último "T" (término de limpeza)
        const ultimoT = progrCam === 100
          ? eventos
              .filter((e) => e.camareiraId === d.camareiraId && e.tipo === "T")
              .reduce<string | null>((latest, e) =>
                !latest || e.timestamp > latest ? e.timestamp : latest, null)
          : null;
        const horarioFim = ultimoT ? format(new Date(ultimoT), "HH:mm") : null;
        return (
          <SerieCard
            key={d.camareiraId}
            label={d.nome.split(" ")[0]}
            iniciais={iniciais}
            foto={d.foto}
            cor={cor}
            ativo={ativo}
            progresso={progrCam}
            horarioFim={horarioFim}
            limpeza={d.mediaLimpezaSegundos}
            deslocamento={d.mediaDeslocamentoSegundos}
            onClick={() => { toggle(d.camareiraId); setLogFilterCamId((p) => p === d.camareiraId ? null : d.camareiraId); }}
          />
        );
      })}
    </>
  );

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 shrink-0">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-gray-900">Burndown do dia</h1>
          <p className="text-sm text-gray-500">{concluidas} de {totalUHs} UHs concluídas · {dateFmt}</p>
          <div className="flex items-center gap-1 mt-1">
            <button onClick={() => navegarData(-1)} className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input type="date" value={dataSel} max={hojeStr} onChange={(e) => setDataSel(e.target.value)}
              className="input w-auto text-base py-1" />
            <button onClick={() => navegarData(1)} disabled={isHoje}
              className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
            {isGerente && (
              <div className="flex items-center gap-2 ml-2">
                <button
                  onClick={enviarRelatorio}
                  disabled={enviandoRelatorio}
                  title="Enviar Relatório Gerencial via Telegram"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  <Send className="w-3 h-3" />
                  {enviandoRelatorio ? "Enviando…" : "Relatório"}
                </button>
                {relatorioMsg && (
                  <span className={`text-xs font-medium ${relatorioMsg.startsWith("✓") ? "text-green-600" : "text-red-600"}`}>
                    {relatorioMsg}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {/* Legenda de eventos */}
        <div className="flex flex-wrap justify-end gap-x-4 gap-y-1">
          {(["L", "I", "T", "C"] as const).map((t) => (
            <span key={t} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: TIPO_COR[t] }} />
              <span className="font-bold">{t}</span> — {TIPO_LABEL[t]}
            </span>
          ))}
        </div>
      </div>

      {/* Gráfico + Log */}
      <div className="flex flex-1 min-h-0 gap-3">

      {/* Gráfico */}
      <div className="card flex-1 min-h-0 flex flex-col gap-4 p-4 relative" style={{ overflow: "visible" }}>

        {/* Desktop: cards de séries sobrepostos no canto superior direito.
            Mobile: ver bloco em fluxo normal logo abaixo do gráfico — overlay
            não cabe em telas estreitas (cards empilhados invadem as linhas). */}
        {!isMobile && (
          <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-1.5">
            {camCards}
          </div>
        )}

        {/* No mobile o gráfico tinha flex-1 (crescia pra ocupar todo espaço
            sobrando), empurrando a barra de progresso e os balões pra fora da
            tela — precisava rolar pra ver as camareiras. Altura fixa e menor
            no mobile deixa mais espaço visível pro resto abaixo. */}
        <div className={isMobile ? "h-52 shrink-0" : "flex-1 min-h-0"} style={{ overflow: "visible" }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={globalPts}
              margin={{ top: isMobile ? 20 : 90, right: 20, bottom: 28, left: 8 }}
              style={{ overflow: "visible" }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical />
              <XAxis dataKey="x" type="number" scale="linear" domain={[0, xMax]} ticks={xTicks}
                tickFormatter={formatXTick} tick={{ fontSize: 10, fill: "#9ca3af" }} allowDataOverflow={false} />
              <YAxis
                domain={[0, 100]}
                ticks={(() => {
                  // 1 tick por UH, mas limita a ~8 ticks visíveis escolhendo step
                  const step = totalUHs <= 10 ? 1 : totalUHs <= 20 ? 2 : totalUHs <= 50 ? 5 : 10;
                  const ticks: number[] = [];
                  for (let uh = 0; uh <= totalUHs; uh += step) {
                    ticks.push(Math.round((uh / totalUHs) * 100));
                  }
                  if (ticks[ticks.length - 1] !== 100) ticks.push(100);
                  return ticks;
                })()}
                tickFormatter={(v) => String(Math.round((v / 100) * totalUHs))}
                tick={{ fontSize: 10, fill: "#9ca3af" }} width={28}
              />
              {concluidas === totalUHs && (
                <ReferenceLine y={0} stroke="#10b981" strokeWidth={2} />
              )}
              {/* Linha global */}
              {showGlobal && (
                <Line type="stepAfter" dataKey="valor" stroke={GLOBAL_COR} strokeWidth={2.5}
                  dot={false} activeDot={false} isAnimationActive={false} />
              )}
              {/* Linhas individuais por camareira */}
              {camSeries.map(({ pts, cor, camId }: any) => (
                <Line key={camId} data={pts} type="stepAfter" dataKey="valor"
                  stroke={cor} strokeWidth={2} strokeDasharray="6 3"
                  dot={false} activeDot={false} isAnimationActive={false} />
              ))}
              <Customized
                component={MultiDotLayer}
                globalPts={globalPts}
                showGlobal={showGlobal}
                camSeries={camSeries}
                hoveredDot={hoveredDot}
                setHoveredDot={setHoveredDot}
                filteredUH={filteredUH}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Barra de progresso — no mobile fica ACIMA dos balões de camareira
            (ver bloco logo abaixo), então quem abre a tela já vê o resumo do
            dia antes de rolar pelos cards individuais. */}
        <div className="shrink-0">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span className="font-medium text-gray-700">{displayProgress.label}</span>
            <span className="font-bold text-gray-900">{displayProgress.pct}% concluído</span>
          </div>
          <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700" style={{
              width: `${displayProgress.pct}%`,
              background: displayProgress.pct === 100 ? "#10b981" : "linear-gradient(90deg,#6366f1,#8b5cf6)",
            }} />
          </div>
          <div className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 text-xs text-gray-400 mt-1">
            <span>{displayProgress.detail}</span>
            <span>100% — todas as UHs liberadas para check-in</span>
          </div>
        </div>

        {/* Mobile: cards de séries em grid de 2 colunas, abaixo da barra de
            progresso (ver isMobile) — melhor aproveitamento do espaço
            horizontal do que empilhar um por linha. */}
        {isMobile && (
          <div className="grid grid-cols-2 gap-1.5 shrink-0 pt-2 border-t border-gray-100">
            {camCards}
          </div>
        )}
      </div>

      {/* Painel de log — lateral direita */}
      <div className="card w-44 flex-shrink-0 flex flex-col min-h-0 overflow-hidden hidden md:flex">
        <div className="px-3 py-2 border-b border-gray-100 shrink-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Eventos</p>
        </div>
        {logFilterCamId && (
          <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between shrink-0">
            <span className="text-[10px] text-gray-700 font-semibold truncate">
              {data.deslocamentos.find((d) => d.camareiraId === logFilterCamId)?.nome.split(" ")[0] ?? "Camareira"}
            </span>
            <button onClick={() => setLogFilterCamId(null)} className="text-[10px] text-gray-400 hover:text-gray-700 leading-none px-1">✕</button>
          </div>
        )}
        {filteredUH && (
          <div className="px-3 py-1.5 bg-blue-50 border-b border-blue-100 flex items-center justify-between shrink-0">
            <span className="text-[10px] text-blue-600 font-semibold">UH {filteredUH}</span>
            <button
              onClick={() => { setFilteredUH(null); setExpandedLogKey(null); setHoveredDot(null); }}
              className="text-[10px] text-blue-400 hover:text-blue-700 leading-none px-1"
            >✕</button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {[...eventos].filter((e) => !e.isPhantom && (!logFilterCamId || e.camareiraId === logFilterCamId)).reverse().map((e) => {
            const key = dotKey(e);
            const isExpanded = expandedLogKey === key;
            const uhEvents = isExpanded
              ? eventos
                  .filter((ev) => !ev.isPhantom && ev.uhNumero === e.uhNumero && dotKey(ev) !== key)
                  .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
              : [];
            return (
              <div key={key}>
                <div
                  className={`px-3 py-2 border-b border-gray-50 flex items-start gap-2 cursor-pointer select-none transition-colors ${isExpanded ? "bg-blue-50/50" : "hover:bg-gray-50"}`}
                  onMouseEnter={() => {
                    const entry = dotMap.get(key);
                    if (entry) setHoveredDot({ key, pt: entry.pt, cor: entry.cor });
                  }}
                  onMouseLeave={() => setHoveredDot(null)}
                  onClick={() => {
                    if (isExpanded) {
                      setExpandedLogKey(null); setFilteredUH(null);
                    } else {
                      setExpandedLogKey(key); setFilteredUH(e.uhNumero);
                    }
                  }}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: TIPO_COR[e.tipo] }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="flex items-center gap-1">
                        <span className="text-xs font-bold text-gray-800">{e.uhNumero}</span>
                        {e.emManutencao && (
                          <span className="text-[9px] text-amber-500 font-medium bg-amber-50 rounded px-1 leading-tight">🔧</span>
                        )}
                      </span>
                      <span className="text-[10px] text-gray-400">{format(new Date(e.timestamp), "HH:mm")}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 truncate">{TIPO_LABEL[e.tipo]}</p>
                    <p className="text-[10px] text-gray-400 truncate">{e.atorNome.split(" ")[0]}</p>
                  </div>
                </div>
                {isExpanded && uhEvents.map((ev) => (
                  <div key={dotKey(ev)} className="px-3 py-1.5 border-b border-blue-50 flex items-start gap-2 bg-blue-50/40">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 opacity-50" style={{ background: TIPO_COR[ev.tipo] }} />
                    <div className="min-w-0 flex-1 opacity-60">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-medium text-gray-700">{TIPO_LABEL[ev.tipo]}</span>
                        <span className="text-[10px] text-gray-400">{format(new Date(ev.timestamp), "HH:mm")}</span>
                      </div>
                      <p className="text-[10px] text-gray-400 truncate">{ev.atorNome.split(" ")[0]}</p>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      </div>
    </div>
  );
}
