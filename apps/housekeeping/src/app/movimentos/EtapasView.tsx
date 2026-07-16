"use client";
import { useState, useEffect, useCallback } from "react";
import { BarChart3, ChevronDown } from "lucide-react";
import { formatarTempo } from "@/lib/scoring";
import PeriodoPicker, { Periodo, buildQuery } from "./PeriodoPicker";
import { apiFetch } from "@/lib/apiFetch";

// Portado de apps/housekeeping/src/app/movimentos/EtapasView.tsx (v1).
// fetch(...) → apiFetch(...); resto idêntico.

const CORES = [
  "#6366f1", "#3b82f6", "#10b981", "#f59e0b",
  "#ec4899", "#8b5cf6", "#06b6d4", "#f97316", "#84cc16", "#14b8a6",
];

type StepInfo = { titulo: string; ordem: number };
type CamareiraStep = { titulo: string; mediaSegundos: number | null; count: number };
type CamareiraData = { id: string; nome: string; steps: CamareiraStep[] };
type MovimentosData = { steps: StepInfo[]; camareiras: CamareiraData[] };

const hoje = () => new Date().toLocaleDateString("en-CA");

function fmtDelta(absDelta: number): string {
  if (absDelta < 60) return `${absDelta}s`;
  const m = Math.floor(absDelta / 60);
  const s = absDelta % 60;
  return s > 0 ? `${m}m${s}s` : `${m}m`;
}

export default function EtapasView() {
  const [periodo, setPeriodo] = useState<Periodo>({ tipo: "alltime", data: hoje() });
  const [dados, setDados] = useState<MovimentosData>({ steps: [], camareiras: [] });
  const [loading, setLoading] = useState(true);

  // Em telas estreitas a tabela larga (uma coluna por camareira) não cabe —
  // rolar horizontalmente pra ver os tempos por camareira é ruim no
  // celular. No mobile trocamos por uma lista de linhas expansíveis
  // (recolhidas por padrão): abre uma e mostra o tempo médio + o tempo de
  // cada camareira naquela etapa, com o desvio em relação à média.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const toggleStep = (titulo: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(titulo)) next.delete(titulo); else next.add(titulo);
      return next;
    });
  };

  const carregar = useCallback(() => {
    setLoading(true);
    apiFetch(`/api/movimentos?${buildQuery(periodo)}`)
      .then((r) => r.json())
      .then((d) => { setDados(d); setLoading(false); });
  }, [periodo]);

  useEffect(() => { carregar(); }, [carregar]);

  const { steps, camareiras } = dados;
  const temDados = camareiras.length > 0 && steps.length > 0;

  // Média global por etapa (média das médias das camareiras)
  const stepStats = steps.map((step) => {
    const vals = camareiras
      .map((cam) => cam.steps.find((st) => st.titulo === step.titulo)?.mediaSegundos)
      .filter((v): v is number => v != null);
    const media = vals.length > 0
      ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
      : 0;
    return { titulo: step.titulo, media };
  });

  const maxMedia = Math.max(...stepStats.map((s) => s.media), 1);
  const totalMediaSteps = stepStats.reduce((s, e) => s + e.media, 0) || 1;

  // Total médio por camareira (soma das medias de etapa)
  const totaisCam = camareiras.map((cam) => {
    const vals = cam.steps.filter((s) => s.mediaSegundos != null).map((s) => s.mediaSegundos!);
    return vals.reduce((a, b) => a + b, 0);
  });

  return (
    <div className="space-y-6">
      <PeriodoPicker value={periodo} onChange={setPeriodo} />

      {loading ? (
        <div className="text-center py-20 text-gray-400">Carregando...</div>
      ) : !temDados ? (
        <div className="card text-center py-16 text-gray-400">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-200" />
          <p>Nenhum dado para este período.</p>
        </div>
      ) : isMobile ? (
        <div className="card divide-y divide-gray-100">
          {stepStats.map((step) => {
            const expanded = expandedSteps.has(step.titulo);
            return (
              <div key={step.titulo}>
                <button
                  onClick={() => toggleStep(step.titulo)}
                  className="w-full flex items-center gap-2.5 py-3 text-left"
                >
                  <span className="font-medium text-gray-700 text-sm w-14 shrink-0 truncate">
                    {step.titulo}
                  </span>
                  <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                    <div
                      className="h-full rounded transition-all"
                      style={{ width: `${(step.media / maxMedia) * 100}%`, backgroundColor: "#10b981" }}
                    />
                  </div>
                  <div className="flex flex-col items-end w-14 shrink-0 whitespace-nowrap">
                    <span className="text-xs font-mono text-gray-600 font-medium">
                      {formatarTempo(step.media)}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      ({Math.round((step.media / totalMediaSteps) * 100)}%)
                    </span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>

                {expanded && (
                  <div className="pb-3 pl-1 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 rounded px-2 py-1.5">
                      <span className="font-medium">Tempo médio</span>
                      <span className="font-mono font-semibold text-gray-700">{formatarTempo(step.media)}</span>
                    </div>
                    {camareiras.map((cam, i) => {
                      const s = cam.steps.find((st) => st.titulo === step.titulo);
                      const val = s?.mediaSegundos;
                      const cor = CORES[i % CORES.length];

                      if (val == null) {
                        return (
                          <div key={cam.id} className="flex items-center justify-between text-xs px-2">
                            <span className="font-medium" style={{ color: cor }}>{cam.nome.split(" ")[0]}</span>
                            <span className="text-gray-300">—</span>
                          </div>
                        );
                      }

                      const delta = val - step.media;
                      const absDelta = Math.abs(Math.round(delta));
                      const isAbove = delta > 10;   // mais lenta que a média
                      const isBelow = delta < -10;  // mais rápida que a média

                      return (
                        <div key={cam.id} className="flex items-center justify-between text-xs px-2">
                          <span className="font-medium" style={{ color: cor }}>{cam.nome.split(" ")[0]}</span>
                          <span className="font-mono text-gray-700 flex items-center gap-1">
                            {formatarTempo(val)}
                            {isAbove && <span className="text-red-500 font-medium">(+{fmtDelta(absDelta)})</span>}
                            {isBelow && <span className="text-green-600 font-medium">(-{fmtDelta(absDelta)})</span>}
                            {!isAbove && !isBelow && <span className="text-gray-300">(≈)</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Total médio */}
          <div className="pt-3 flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Total médio</span>
            <span className="text-xs font-mono font-bold text-gray-700">{formatarTempo(totalMediaSteps)}</span>
          </div>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 480 + camareiras.length * 110 }}>
            <thead>
              <tr className="border-b-2 border-gray-100">
                <th className="text-left pb-3 pr-4 text-xs text-gray-400 font-medium whitespace-nowrap w-24">
                  Etapa
                </th>
                <th className="text-left pb-3 pr-6 text-xs text-gray-400 font-medium" style={{ width: "36%" }}>
                  Média geral
                </th>
                {camareiras.map((cam, i) => (
                  <th
                    key={cam.id}
                    className="text-center pb-3 px-3 text-xs font-semibold whitespace-nowrap"
                    style={{ color: CORES[i % CORES.length] }}
                  >
                    {cam.nome.split(" ")[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stepStats.map((step) => (
                <tr
                  key={step.titulo}
                  className="border-t border-gray-50 hover:bg-gray-50 transition-colors"
                >
                  {/* Nome da etapa */}
                  <td className="py-3 pr-4 font-medium text-gray-700 whitespace-nowrap">
                    {step.titulo}
                  </td>

                  {/* Barra horizontal + média global + % do total */}
                  <td className="py-3 pr-6">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                        <div
                          className="h-full rounded transition-all"
                          style={{
                            width: `${(step.media / maxMedia) * 100}%`,
                            backgroundColor: "#10b981",
                          }}
                        />
                      </div>
                      <div className="flex flex-col items-end w-14 whitespace-nowrap">
                        <span className="text-xs font-mono text-gray-600 font-medium">
                          {formatarTempo(step.media)}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          ({Math.round((step.media / totalMediaSteps) * 100)}%)
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Coluna por camareira */}
                  {camareiras.map((cam) => {
                    const s = cam.steps.find((st) => st.titulo === step.titulo);
                    const val = s?.mediaSegundos;

                    if (val == null) {
                      return (
                        <td key={cam.id} className="text-center px-3 py-3 text-gray-200 text-xs">
                          —
                        </td>
                      );
                    }

                    const delta = val - step.media;
                    const absDelta = Math.abs(Math.round(delta));
                    const isAbove = delta > 10;   // mais lenta que a média
                    const isBelow = delta < -10;  // mais rápida que a média

                    return (
                      <td key={cam.id} className="text-center px-3 py-3">
                        <div className="flex flex-col items-center leading-tight gap-0.5">
                          <span className="font-mono text-gray-700 text-xs font-semibold">
                            {formatarTempo(val)}
                          </span>
                          {isAbove && (
                            <span className="text-[10px] font-medium text-red-500">
                              (↑ +{fmtDelta(absDelta)})
                            </span>
                          )}
                          {isBelow && (
                            <span className="text-[10px] font-medium text-green-600">
                              (↓ -{fmtDelta(absDelta)})
                            </span>
                          )}
                          {!isAbove && !isBelow && (
                            <span className="text-[10px] text-gray-300">≈</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Linha total */}
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td className="py-3 pr-4 text-[11px] font-bold text-gray-600 uppercase tracking-wide whitespace-nowrap">
                  Total médio
                </td>
                <td className="py-3 pr-6">
                  <div className="flex flex-col items-end w-14 ml-auto">
                    <span className="text-xs font-mono font-bold text-gray-700">
                      {formatarTempo(totalMediaSteps)}
                    </span>
                    <span className="text-[10px] text-gray-400">(100%)</span>
                  </div>
                </td>
                {camareiras.map((cam, ci) => (
                  <td key={cam.id} className="text-center px-3 py-3">
                    <span className="font-mono font-bold text-gray-800 text-xs">
                      {totaisCam[ci] > 0 ? formatarTempo(totaisCam[ci]) : "—"}
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
