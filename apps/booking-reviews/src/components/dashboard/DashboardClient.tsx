"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildDailySeries } from "@/lib/dashboard";
import { ReviewDetailModal } from "./ReviewDetailModal";

// Portado de apps/booking-reviews/src/components/dashboard/DashboardClient.tsx
// (v1) — lógica de gráficos/filtros idêntica, só o nome dos campos de
// propriedade mudou pra seguir o padrão já usado no Kanban de Tratamento
// (PropertyOption.label → nome; ReviewListItem.propertyLabel → propertyNome),
// já que agora Property é FK real (ver kanban/types.ts).

export type ReviewListItem = {
  id: string;
  guestName: string;
  platform: string;
  comment: string | null;
  ratingNormalized: number;
  ratingRaw: number;
  ratingScaleMax: number;
  guestSubmittedAt: string;
  propertyId: string;
  propertyLabel: string | null;
  stage: string;
  categories: { id: string; name: string }[];
};

export type PropertyOption = { id: string; nome: string };

function dateKeyFromIso(iso: string) {
  return iso.slice(0, 10);
}

const RADIAN = Math.PI / 180;

// Label de percentual dentro de cada fatia (sem casa decimal) — padrão do
// próprio recharts pra posicionar texto no meio do arco da fatia.
function renderPercentLabel(props: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
}) {
  const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0 } = props;
  if (percent <= 0) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#fff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={10}
      fontWeight={700}
    >
      {`${Math.round(percent * 100)}%`}
    </text>
  );
}

// Mesmas etapas do Kanban de Tratamento (ver src/components/kanban/types.ts),
// com rótulos curtos pra caber no placar compacto do dashboard.
const KANBAN_STAGES: { key: string; label: string }[] = [
  { key: "RECEBIDA", label: "Recebida" },
  { key: "ANALISE_PLANEJAMENTO", label: "Planejamento" },
  { key: "EXECUCAO", label: "Execução" },
  { key: "AVALIACAO_EFICACIA", label: "Eficácia" },
  { key: "FINALIZADA", label: "Finalizada" },
];

const PIE_COLORS = [
  "#3b82f6",
  "#f97316",
  "#22c55e",
  "#ef4444",
  "#8b5cf6",
  "#eab308",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#64748b",
];

export function DashboardClient({
  targetScore,
  properties,
  reviews,
}: {
  targetScore: number;
  properties: PropertyOption[];
  reviews: ReviewListItem[];
}) {
  const [showRolling7, setShowRolling7] = useState(true);
  const [showRolling30, setShowRolling30] = useState(true);
  const [showAllTime, setShowAllTime] = useState(false);
  // Ao clicar numa barra ou fatia, só esmaecemos as demais — não filtra mais
  // a lista de avaliações à direita (isso agora é papel só do gráfico de
  // categorias/pizza).
  const [selectedBarKey, setSelectedBarKey] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [selectedReview, setSelectedReview] = useState<ReviewListItem | null>(null);

  // Filtro por propriedade afeta tudo — gráfico, pizza de categorias e
  // lista de detalhamento — pra dar uma visão isolada do desempenho de cada
  // propriedade quando selecionada.
  const scopedReviews = useMemo(
    () => (selectedPropertyId ? reviews.filter((r) => r.propertyId === selectedPropertyId) : reviews),
    [reviews, selectedPropertyId]
  );

  const series = useMemo(
    () =>
      buildDailySeries(
        scopedReviews.map((r) => ({
          id: r.id,
          guestName: r.guestName,
          platform: r.platform,
          ratingNormalized: r.ratingNormalized,
          guestSubmittedAt: new Date(r.guestSubmittedAt),
          propertyLabel: r.propertyLabel,
        })),
        30
      ),
    [scopedReviews]
  );

  // Placar de cards por etapa do Kanban (Tratamento) — respeita o filtro
  // de propriedade selecionado aqui no dashboard.
  const stageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const stage of KANBAN_STAGES) counts.set(stage.key, 0);
    for (const r of scopedReviews) counts.set(r.stage, (counts.get(r.stage) ?? 0) + 1);
    return counts;
  }, [scopedReviews]);

  // Eixo Y secundário (direita) — escala "zoom" pras linhas de média móvel,
  // calculada a partir do menor e maior valor entre elas (e a Meta), em vez
  // da escala fixa 0-5 usada pelas barras. Só considera as linhas
  // atualmente visíveis (checkboxes), pra reescalar quando alguma é ocultada.
  const rightAxisDomain = useMemo((): [number, number] => {
    const values: number[] = [targetScore];
    for (const p of series) {
      if (showRolling7 && p.rolling7 !== null) values.push(p.rolling7);
      if (showRolling30 && p.rolling30 !== null) values.push(p.rolling30);
      if (showAllTime && p.allTime !== null) values.push(p.allTime);
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) {
      return [Math.max(0, min - 0.5), Math.min(5, max + 0.5)];
    }
    const padding = (max - min) * 0.15;
    return [Math.max(0, min - padding), Math.min(5, max + padding)];
  }, [series, targetScore, showRolling7, showRolling30, showAllTime]);

  const overallAvg = useMemo(() => {
    if (scopedReviews.length === 0) return 0;
    return (
      Math.round(
        (scopedReviews.reduce((acc, r) => acc + r.ratingNormalized, 0) / scopedReviews.length) * 100
      ) / 100
    );
  }, [scopedReviews]);

  // Distribuição das categorias entre as avaliações que de fato passaram por
  // categorização na Análise & Planejamento. Avaliações de nota 5
  // (skippedToFinal) nunca ganham categoria, então já ficam de fora
  // naturalmente — nenhum filtro extra é necessário.
  const categoryData = useMemo(() => {
    const counts = new Map<string, { id: string; name: string; value: number }>();
    for (const r of scopedReviews) {
      for (const c of r.categories) {
        const current = counts.get(c.id) ?? { id: c.id, name: c.name, value: 0 };
        current.value += 1;
        counts.set(c.id, current);
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.value - a.value);
  }, [scopedReviews]);

  const selectedCategoryName = useMemo(
    () => categoryData.find((c) => c.id === selectedCategoryId)?.name ?? null,
    [categoryData, selectedCategoryId]
  );

  const selectedDayLabel = useMemo(
    () => series.find((p) => p.dateKey === selectedBarKey)?.dateLabel ?? null,
    [series, selectedBarKey]
  );

  // A lista responde às seleções: barra clicada filtra pelo dia, fatia
  // da pizza filtra pela categoria — quando várias estão ativas, mostra só
  // quem bate com todas ao mesmo tempo.
  const visibleReviews = useMemo(() => {
    let list = [...scopedReviews].sort(
      (a, b) => new Date(b.guestSubmittedAt).getTime() - new Date(a.guestSubmittedAt).getTime()
    );
    if (selectedBarKey) {
      list = list.filter((r) => dateKeyFromIso(r.guestSubmittedAt) === selectedBarKey);
    }
    if (selectedCategoryId) {
      list = list.filter((r) => r.categories.some((c) => c.id === selectedCategoryId));
    }
    return list;
  }, [scopedReviews, selectedBarKey, selectedCategoryId]);

  const detailHeading = useMemo(() => {
    const parts: string[] = [];
    if (selectedDayLabel) parts.push(`dia ${selectedDayLabel}`);
    if (selectedCategoryName) parts.push(`categoria: ${selectedCategoryName}`);
    return parts.length > 0 ? `(${parts.join(" · ")})` : "(mais recentes)";
  }, [selectedDayLabel, selectedCategoryName]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Painel de Avaliações</h1>
          <p className="text-sm text-slate-500">Últimos 30 dias</p>
        </div>
        <div className="flex items-center gap-3">
          <div>
            <label className="block text-[11px] text-slate-400 mb-0.5">Propriedade</label>
            <select
              value={selectedPropertyId}
              onChange={(e) => {
                setSelectedPropertyId(e.target.value);
                setSelectedBarKey(null);
                setSelectedCategoryId(null);
              }}
              className="text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
            >
              <option value="">Todas as propriedades</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-center">
            <div className="text-xs text-slate-400">Valor Meta</div>
            <div className="text-lg font-semibold text-slate-700">
              {targetScore.toFixed(2)}
            </div>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-center">
            <div className="text-xs text-blue-500">Nota Média (all-time)</div>
            <div className="text-lg font-semibold text-blue-700">{overallAvg.toFixed(2)}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="text-[11px] text-slate-400 text-center mb-1">Cards por etapa</div>
            <div className="flex items-stretch gap-2.5">
              {KANBAN_STAGES.map((stage) => (
                <div key={stage.key} className="text-center">
                  <div className="text-sm font-semibold text-slate-700 leading-tight">
                    {stageCounts.get(stage.key) ?? 0}
                  </div>
                  <div className="text-[9.5px] text-slate-400 leading-tight whitespace-nowrap">
                    {stage.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-slate-700">Análise Mensal</h2>
            <div className="flex gap-4 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showRolling7}
                  onChange={(e) => setShowRolling7(e.target.checked)}
                />
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#f97316" }} />
                Média 7 dias
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showRolling30}
                  onChange={(e) => setShowRolling30(e.target.checked)}
                />
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#ef4444" }} />
                Média 30 dias
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showAllTime}
                  onChange={(e) => setShowAllTime(e.target.checked)}
                />
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#8b5cf6" }} />
                All-time
              </label>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#bfdbfe" }} />
              Nota do dia
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-0.5" style={{ background: "#22c55e" }} />
              Meta
            </span>
          </div>

          <ResponsiveContainer width="100%" height={440}>
            <ComposedChart
              data={series}
              margin={{ bottom: 24, right: 8 }}
              onClick={(state) => {
                const label = state?.activeLabel;
                if (typeof label === "string") {
                  const point = series.find((p) => p.dateLabel === label);
                  if (point) {
                    setSelectedBarKey((prev) => (prev === point.dateKey ? null : point.dateKey));
                  }
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 10 }}
                interval={0}
                angle={-45}
                textAnchor="end"
                height={50}
              />
              <YAxis yAxisId="left" domain={[0, 5]} tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={rightAxisDomain}
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => (typeof v === "number" ? v.toFixed(1) : v)}
              />
              <Tooltip
                formatter={(value, name) => [
                  typeof value === "number" ? value.toFixed(2) : "-",
                  name,
                ]}
              />
              <ReferenceLine
                yAxisId="right"
                y={targetScore}
                stroke="#22c55e"
                strokeWidth={2}
                label={{ value: "Meta", fontSize: 10, position: "right" }}
              />
              <Bar yAxisId="left" dataKey="avg" name="Nota do dia" radius={[3, 3, 0, 0]} cursor="pointer">
                {series.map((entry) => (
                  <Cell
                    key={entry.dateKey}
                    fill="#bfdbfe"
                    fillOpacity={selectedBarKey && selectedBarKey !== entry.dateKey ? 0.25 : 1}
                  />
                ))}
              </Bar>
              {showRolling7 && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="rolling7"
                  name="Média 7d"
                  stroke="#f97316"
                  dot={false}
                  strokeWidth={2}
                />
              )}
              {showRolling30 && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="rolling30"
                  name="Média 30d"
                  stroke="#ef4444"
                  dot={false}
                  strokeWidth={2}
                />
              )}
              {showAllTime && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="allTime"
                  name="All-time"
                  stroke="#8b5cf6"
                  dot={false}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          {selectedBarKey && (
            <button
              onClick={() => setSelectedBarKey(null)}
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              Limpar destaque ({series.find((p) => p.dateKey === selectedBarKey)?.dateLabel})
            </button>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-medium text-slate-700 mb-2">Categorias das Avaliações</h2>
            {categoryData.length === 0 ? (
              <p className="text-xs text-slate-400">Nenhuma avaliação categorizada ainda.</p>
            ) : (
              <div className="flex items-center gap-3">
                <ResponsiveContainer width={130} height={130}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={32}
                      outerRadius={62}
                      paddingAngle={2}
                      label={renderPercentLabel}
                      labelLine={false}
                    >
                      {categoryData.map((entry, idx) => (
                        <Cell
                          key={entry.id}
                          fill={PIE_COLORS[idx % PIE_COLORS.length]}
                          fillOpacity={
                            selectedCategoryId && selectedCategoryId !== entry.id ? 0.25 : 1
                          }
                          cursor="pointer"
                          onClick={() =>
                            setSelectedCategoryId((prev) => (prev === entry.id ? null : entry.id))
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [
                        `${typeof value === "number" ? value : "-"} avaliação(ões)`,
                        name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1 text-xs max-h-[130px] overflow-y-auto pr-1">
                  {categoryData.map((c, idx) => {
                    const dimmed = !!selectedCategoryId && selectedCategoryId !== c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() =>
                          setSelectedCategoryId((prev) => (prev === c.id ? null : c.id))
                        }
                        className={
                          "w-full flex items-center justify-between gap-2 rounded px-1.5 py-1 hover:bg-slate-50 transition-opacity " +
                          (dimmed ? "opacity-30" : "")
                        }
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }}
                          />
                          <span className="truncate text-slate-700">{c.name}</span>
                        </span>
                        <span className="text-slate-400 shrink-0">{c.value}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {selectedCategoryId && (
              <button
                onClick={() => setSelectedCategoryId(null)}
                className="mt-1 text-xs text-blue-600 hover:underline"
              >
                Limpar filtro de categoria
              </button>
            )}
          </div>

          <div className="border-t border-slate-100 pt-3 flex flex-col min-h-0">
            <h2 className="text-sm font-medium text-slate-700 mb-2">Detalhamento {detailHeading}</h2>
            <div className="overflow-y-auto max-h-[220px] divide-y divide-slate-100">
              {visibleReviews.length === 0 && (
                <p className="text-sm text-slate-400 py-4">Nenhuma avaliação neste período.</p>
              )}
              {visibleReviews.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedReview(r)}
                  className="w-full text-left py-2 flex items-center justify-between hover:bg-slate-50 px-2 rounded-md"
                >
                  <div>
                    <div className="text-sm text-slate-700">{r.guestName}</div>
                    <div className="text-xs text-slate-400">
                      {r.propertyLabel ?? "—"} · {r.platform}
                    </div>
                  </div>
                  <span
                    className={
                      "text-sm font-semibold " +
                      (r.ratingNormalized >= 4.5
                        ? "text-green-600"
                        : r.ratingNormalized >= 3.5
                        ? "text-amber-600"
                        : "text-red-600")
                    }
                  >
                    {r.ratingNormalized.toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {selectedReview && (
        <ReviewDetailModal review={selectedReview} onClose={() => setSelectedReview(null)} />
      )}
    </div>
  );
}
