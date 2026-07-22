"use client";
import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from "recharts";
import { AlertTriangle, Trophy, Trash2, RotateCcw, Eraser, Timer } from "lucide-react";
import { scoreLabel, formatarTempo } from "@/lib/scoring";
import PeriodoPicker, { Periodo, buildQuery } from "./PeriodoPicker";
import UHDetailModal from "@/components/UHDetailModal";
import QueixaDetailModal from "@/components/QueixaDetailModal";
import { apiFetch } from "@/lib/apiFetch";

// Portado de apps/housekeeping/src/app/movimentos/PerformanceView.tsx (v1).
// fetch(...) → apiFetch(...); resto idêntico. `foto` sempre chega null da
// API v2 (User não tem esse campo) — Avatar/AvatarTick já caem pra iniciais.

const CORES = ["#6366f1","#3b82f6","#10b981","#f59e0b","#ec4899","#8b5cf6","#06b6d4","#f97316"];

// Tick customizado para XAxis: renderiza foto circular + nome
function AvatarTick({ x, y, payload, chartData, prefix }: any) {
  const entry = chartData?.find((d: any) => d.nome === payload?.value);
  const foto = entry?.foto;
  const nome = payload?.value ?? "";
  const R = 14;
  const clipId = `avatar-clip-${prefix}-${nome.replace(/\s/g, "")}`;

  return (
    <g transform={`translate(${x},${y + 4})`}>
      <defs>
        <clipPath id={clipId}>
          <circle cx={0} cy={R} r={R} />
        </clipPath>
      </defs>

      {foto ? (
        <image
          href={foto}
          x={-R}
          y={0}
          width={R * 2}
          height={R * 2}
          clipPath={`url(#${clipId})`}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <>
          <circle cx={0} cy={R} r={R} fill="#dbeafe" />
          <text x={0} y={R + 4} textAnchor="middle" fill="#1d4ed8" fontSize={11} fontWeight="bold">
            {nome[0]?.toUpperCase()}
          </text>
        </>
      )}

      <text x={0} y={R * 2 + 13} textAnchor="middle" fill="#6b7280" fontSize={10}>
        {nome}
      </text>
    </g>
  );
}

const hoje = () => new Date().toLocaleDateString("en-CA");

type DetalheUH = { sessaoId: string; assignmentId: string; uhNumero: string; data: string; duracaoSegundos: number; falhas: number; score: number; excluidoDoScore: boolean; multiplaCamareira?: boolean };
type QueixaLimpeza = { id: string; data: string; uhNumero: string; titulo: string; descricao: string; pontosDescontados: number };
type Score = { id: string; nome: string; foto?: string | null; mediaScore: number | null; totalUHs: number; totalFalhas: number; detalhes?: DetalheUH[]; totalPenalidades?: number; queixasLimpeza?: QueixaLimpeza[] };

function Avatar({ foto, nome }: { foto?: string | null; nome: string }) {
  if (foto) return <img src={foto} alt={nome} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />;
  return (
    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center flex-shrink-0 text-sm">
      {nome[0]?.toUpperCase()}
    </div>
  );
}

function scoreColors(score: number | null) {
  if (!score) return { bg: "bg-gray-100", text: "text-gray-400" };
  if (score >= 90) return { bg: "bg-green-100", text: "text-green-700" };
  if (score >= 75) return { bg: "bg-blue-100", text: "text-blue-700" };
  if (score >= 60) return { bg: "bg-yellow-100", text: "text-yellow-700" };
  return { bg: "bg-red-100", text: "text-red-700" };
}

function CustomTooltip({ active, payload, label, isTime }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-medium text-gray-800 mb-1">{label}</p>
      <p className="text-gray-600">{isTime ? formatarTempo(payload[0].value) : `${payload[0].value} falha(s)`}</p>
    </div>
  );
}

export default function PerformanceView({ isMaster, podeOperar }: { isMaster?: boolean; podeOperar: boolean }) {
  const [periodo, setPeriodo] = useState<Periodo>({ tipo: "hoje", data: hoje() });
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [excluindoTodos, setExcluindoTodos] = useState<string | null>(null);
  const [detalheAssignmentId, setDetalheAssignmentId] = useState<string | null>(null);
  const [queixaDetalheId, setQueixaDetalheId] = useState<string | null>(null);

  // No app nativo (Capacitor) a tela é sempre estreita e o ranking é o que
  // importa pra quem tá no chão de fábrica — os gráficos de barra só disputam
  // espaço vertical. window.Capacitor é injetado automaticamente pela shell
  // nativa; se não existir, estamos no navegador normal (desktop ou mobile web).
  const [isNativeApp, setIsNativeApp] = useState(false);
  useEffect(() => {
    setIsNativeApp(!!(window as any).Capacitor?.isNativePlatform?.());
  }, []);

  const toggleExcluir = async (sessaoId: string) => {
    if (!podeOperar) return;
    setToggling(sessaoId);
    await apiFetch("/api/scores/excluir", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessaoId }),
    });
    setToggling(null);
    carregar();
  };

  const excluirTodos = async (camareiraId: string, excluir: boolean) => {
    if (!podeOperar) return;
    setExcluindoTodos(camareiraId);
    await apiFetch("/api/scores/excluir-todos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ camareiraId, excluir }),
    });
    setExcluindoTodos(null);
    carregar();
  };

  const carregar = useCallback(() => {
    setLoading(true);
    apiFetch(`/api/scores?${buildQuery(periodo)}`)
      .then((r) => r.json())
      .then((d) => { setScores(d); setLoading(false); });
  }, [periodo]);

  useEffect(() => { carregar(); }, [carregar]);

  // Dados para os gráficos
  const comDados = scores.filter((s) => s.totalUHs > 0);

  const dadosTempo = comDados.map((s, i) => ({
    nome: s.nome.split(" ")[0],
    foto: s.foto ?? null,
    mediaSeg: s.detalhes && s.detalhes.length > 0
      ? Math.round(s.detalhes.filter(d => !d.excluidoDoScore).reduce((acc, d) => acc + (d.duracaoSegundos ?? 0), 0) / s.totalUHs)
      : 0,
    cor: CORES[i % CORES.length],
  }));

  const dadosErros = comDados.map((s, i) => ({
    nome: s.nome.split(" ")[0],
    foto: s.foto ?? null,
    falhas: s.totalFalhas,
    cor: CORES[i % CORES.length],
  }));

  // Posição de cada camareira nos rankings de tempo médio e de falhas — pode
  // ser diferente da posição geral por score, já que o score pondera
  // velocidade + qualidade juntas (ex.: a mais rápida nem sempre é quem
  // comete menos falhas). mediaSeg vem de dadosTempo, alinhado por índice
  // com comDados (mesma origem/ordem).
  const mediaSegPorId: Record<string, number> = Object.fromEntries(
    comDados.map((s, i) => [s.id, dadosTempo[i].mediaSeg])
  );
  const rankTempoPorId: Record<string, number> = Object.fromEntries(
    [...comDados]
      .sort((a, b) => mediaSegPorId[a.id] - mediaSegPorId[b.id])
      .map((s, i) => [s.id, i + 1])
  );
  const rankFalhasPorId: Record<string, number> = Object.fromEntries(
    [...comDados]
      .sort((a, b) => a.totalFalhas - b.totalFalhas)
      .map((s, i) => [s.id, i + 1])
  );

  // Sem emoji de medalha (🥇🥈🥉): alguns WebViews (ex.: iOS Simulator) não
  // renderizam certos emojis e mostram "?" no lugar. Número + cor é mais
  // robusto e funciona igual em qualquer ambiente.
  const medalha = (i: number) => `${i + 1}º`;
  const medalhaCor = (i: number) =>
    i === 0 ? "text-yellow-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-orange-700" : "text-gray-300";

  return (
    <div className="space-y-6">
      <PeriodoPicker value={periodo} onChange={setPeriodo} />

      {loading ? (
        <div className="text-center py-20 text-gray-400">Carregando...</div>
      ) : comDados.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <Trophy className="w-12 h-12 mx-auto mb-3 text-gray-200" />
          <p>Nenhum dado para este período.</p>
        </div>
      ) : (
        <>
          {/* Layout: ranking à esquerda, gráficos à direita */}
          <div className={`grid grid-cols-1 ${isNativeApp ? "" : "lg:grid-cols-[1fr_420px]"} gap-4 items-start`}>

            {/* Ranking */}
            <div className="space-y-3">
            {scores.map((cam, i) => {
              const { label } = cam.mediaScore ? scoreLabel(cam.mediaScore) : { label: "Sem dados" };
              const { bg, text } = scoreColors(cam.mediaScore);
              const expandido = selecionada === cam.id;

              return (
                <div key={cam.id} className="card">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-4 flex-1 cursor-pointer" onClick={() => setSelecionada(expandido ? null : cam.id)}>
                      <div className={`text-2xl font-bold w-10 text-center flex-shrink-0 ${medalhaCor(i)}`}>{medalha(i)}</div>
                      <Avatar foto={cam.foto} nome={cam.nome} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-gray-900">{cam.nome}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${bg} ${text}`}>{label}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                          <span>{cam.totalUHs} UH(s)</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-3xl font-bold ${text}`}>{cam.mediaScore ?? "—"}</p>
                        <p className="text-xs text-gray-400">pontos</p>
                        {!!cam.totalPenalidades && (
                          <p className="text-xs text-red-500 font-medium mt-0.5">
                            -{cam.totalPenalidades} ({cam.queixasLimpeza?.length ?? 0} queixa{(cam.queixasLimpeza?.length ?? 0) > 1 ? "s" : ""})
                          </p>
                        )}

                        {/* Tempo médio e falhas + posição da camareira nesses
                            rankings específicos (podem diferir da posição geral
                            por score, que pondera velocidade + qualidade). */}
                        {cam.totalUHs > 0 && (
                          <div className="mt-1.5 space-y-0.5 text-xs">
                            <p className="flex items-center justify-end gap-1 text-gray-500">
                              <Timer className="w-3 h-3" />
                              <span>{formatarTempo(mediaSegPorId[cam.id] ?? 0)}</span>
                              <span className="text-gray-400">· {rankTempoPorId[cam.id]}º</span>
                            </p>
                            <p className={`flex items-center justify-end gap-1 ${cam.totalFalhas > 0 ? "text-red-500" : "text-gray-500"}`}>
                              {cam.totalFalhas > 0 && <AlertTriangle className="w-3 h-3" />}
                              <span>{cam.totalFalhas} falha(s)</span>
                              <span className="text-gray-400">· {rankFalhasPorId[cam.id]}º</span>
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    {isMaster && (
                      <button
                        onClick={(e) => { e.stopPropagation(); excluirTodos(cam.id, true); }}
                        disabled={excluindoTodos === cam.id || !podeOperar}
                        title={!podeOperar ? "Você não tem acesso para operar este módulo" : "Excluir TODOS os scores desta camareira (all time)"}
                        className="flex-shrink-0 p-2 rounded text-red-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                      >
                        {excluindoTodos === cam.id
                          ? <span className="text-xs text-gray-400">...</span>
                          : <Eraser className="w-4 h-4" />}
                      </button>
                    )}
                  </div>

                  {expandido && ((cam.detalhes && cam.detalhes.length > 0) || (cam.queixasLimpeza && cam.queixasLimpeza.length > 0)) && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      {!!cam.queixasLimpeza?.length && (
                        <div className="mb-3">
                          <p className="text-xs font-medium text-red-500 uppercase tracking-wide mb-2">Queixas de hóspede (Limpeza)</p>
                          <div className="space-y-1.5">
                            {cam.queixasLimpeza.map((q) => (
                              <div key={q.id}
                                className="flex items-center gap-2 text-sm rounded-lg px-3 py-2 bg-red-50 cursor-pointer hover:bg-red-100 transition-colors"
                                onClick={() => setQueixaDetalheId(q.id)}>
                                <span className="font-medium w-16 flex-shrink-0">{q.uhNumero}</span>
                                <span className="text-gray-600 text-xs flex-1 truncate">{q.titulo}</span>
                                <span className="text-gray-400 text-xs flex-shrink-0">{q.data}</span>
                                <span className="font-bold flex-shrink-0 text-red-600">-{q.pontosDescontados} pts</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {!!cam.detalhes?.length && (
                      <>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">UHs processadas</p>
                      <div className="space-y-1.5">
                        {cam.detalhes.map((d) => (
                          <div key={d.sessaoId} className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-100 transition-colors ${d.excluidoDoScore || d.multiplaCamareira ? "bg-red-50 opacity-60" : "bg-gray-50"}`}
                            onClick={() => setDetalheAssignmentId(d.assignmentId)}>
                            <span className="font-medium w-16 flex-shrink-0">{d.uhNumero}</span>
                            <span className="text-gray-400 text-xs flex-1">{d.data}</span>
                            <span className="text-gray-600 flex-shrink-0">{formatarTempo(d.duracaoSegundos)}</span>
                            <span className={`flex-shrink-0 ${d.falhas > 0 ? "text-red-500" : "text-green-600"}`}>
                              {d.falhas > 0 ? `${d.falhas} falha(s)` : "Sem falhas"}
                            </span>
                            <span className={`font-bold flex-shrink-0 ${d.excluidoDoScore || d.multiplaCamareira ? "line-through text-gray-400" : text}`}>
                              {d.score} pts
                            </span>
                            {d.excluidoDoScore && <span className="text-xs text-red-400 flex-shrink-0">excluído</span>}
                            {d.multiplaCamareira && <span title="Mais de uma camareira nesta UH — ninguém pontua" className="text-xs text-amber-500 flex-shrink-0">2+ camareiras</span>}
                            {isMaster && !d.multiplaCamareira && (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleExcluir(d.sessaoId); }}
                                disabled={toggling === d.sessaoId || !podeOperar}
                                title={!podeOperar ? "Você não tem acesso para operar este módulo" : d.excluidoDoScore ? "Reincluir no score" : "Excluir do score"}
                                className={`ml-auto flex-shrink-0 p-1 rounded transition-colors disabled:opacity-40 ${
                                  d.excluidoDoScore
                                    ? "text-green-500 hover:bg-green-100"
                                    : "text-red-400 hover:bg-red-100"
                                }`}
                              >
                                {d.excluidoDoScore
                                  ? <RotateCcw className="w-3.5 h-3.5" />
                                  : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Legenda */}
            <div className="card bg-gray-50">
              <p className="text-xs font-medium text-gray-500 mb-1">Como o score é calculado</p>
              <p className="text-xs text-gray-500">
                Score = (Velocidade × 50%) + (Qualidade × 50%) · Velocidade: 100 pts se ≤25 min, +2 pts/min abaixo, -3 pts/min acima. Qualidade: 100 pts, -10 pts por falha.
              </p>
            </div>
            </div>{/* fim ranking */}

            {/* Gráficos empilhados — só na versão web (desktop/mobile browser).
                No app nativo (Capacitor) ficam ocultos: a tela é sempre
                estreita e o ranking já cobre tempo médio/falhas/posição. */}
            {!isNativeApp && (
              <div className="space-y-4">
                {/* Gráfico 1: Tempo médio */}
                <div className="card">
                  <h3 className="font-bold text-gray-900 mb-3 text-sm flex items-center gap-1.5"><Timer className="w-4 h-4" />Tempo médio por UH</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={dadosTempo} margin={{ left: 0, right: 8, top: 4, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis
                        dataKey="nome"
                        height={62}
                        interval={0}
                        tick={(props) => <AvatarTick {...props} chartData={dadosTempo} prefix="t" />}
                      />
                      <YAxis tickFormatter={(v) => `${Math.floor(v / 60)}m`} tick={{ fontSize: 10 }} width={36} />
                      <Tooltip content={<CustomTooltip isTime />} />
                      <Bar dataKey="mediaSeg" radius={[4, 4, 0, 0]}>
                        {dadosTempo.map((d, i) => <Cell key={i} fill={d.cor} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Gráfico 2: Erros */}
                <div className="card">
                  <h3 className="font-bold text-gray-900 mb-3 text-sm flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />Total de erros</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={dadosErros} margin={{ left: 0, right: 8, top: 4, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis
                        dataKey="nome"
                        height={62}
                        interval={0}
                        tick={(props) => <AvatarTick {...props} chartData={dadosErros} prefix="e" />}
                      />
                      <YAxis tick={{ fontSize: 10 }} width={28} allowDecimals={false} />
                      <Tooltip content={<CustomTooltip isTime={false} />} />
                      <Bar dataKey="falhas" radius={[4, 4, 0, 0]}>
                        {dadosErros.map((d, i) => <Cell key={i} fill={d.cor} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}{/* fim gráficos */}

          </div>{/* fim grid */}
        </>
      )}

      {detalheAssignmentId && (
        <UHDetailModal
          assignmentId={detalheAssignmentId}
          onClose={() => setDetalheAssignmentId(null)}
        />
      )}

      {queixaDetalheId && (
        <QueixaDetailModal
          queixaId={queixaDetalheId}
          onClose={() => setQueixaDetalheId(null)}
        />
      )}
    </div>
  );
}
