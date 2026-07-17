"use client";

// Portado de apps/booking-reviews/src/components/desempenho/AttendantChart.tsx
// (v1) verbatim.

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyPoint } from "@/lib/dashboard";

// Gráfico dia a dia da atendente: duas linhas (média móvel 7 dias e
// all-time), com eixo X (dia) e eixo Y (nota) rotulados. O eixo Y usa
// domínio dinâmico (min/max dos valores visíveis, com uma folga) em vez de
// 0-5 fixo, pra deixar a variação bem visível mesmo quando ela é pequena.
// Clicar num dia seleciona/desseleciona ele (destacado com uma linha de
// referência), e o card em volta usa isso pra filtrar a lista de avaliações.
export function AttendantChart({
  series,
  selectedDay,
  onSelectDay,
}: {
  series: DailyPoint[];
  selectedDay: string | null;
  onSelectDay: (dateKey: string | null) => void;
}) {
  const hasData = series.some((p) => p.rolling7 !== null || p.allTime !== null);

  const yDomain = useMemo((): [number, number] => {
    const values: number[] = [];
    for (const p of series) {
      if (p.rolling7 !== null) values.push(p.rolling7);
      if (p.allTime !== null) values.push(p.allTime);
    }
    if (values.length === 0) return [0, 5];
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) return [Math.max(0, min - 0.5), Math.min(5, max + 0.5)];
    const padding = (max - min) * 0.2;
    return [Math.max(0, min - padding), Math.min(5, max + padding)];
  }, [series]);

  if (!hasData) return null;

  const selectedLabel = series.find((p) => p.dateKey === selectedDay)?.dateLabel ?? null;

  return (
    <div className="mb-3 -mx-1">
      <ResponsiveContainer width="100%" height={170} className="cursor-pointer">
        <LineChart
          data={series}
          margin={{ top: 6, right: 10, bottom: 18, left: 4 }}
          onClick={(state) => {
            const label = state?.activeLabel;
            if (typeof label === "string") {
              const point = series.find((p) => p.dateLabel === label);
              if (point) onSelectDay(selectedDay === point.dateKey ? null : point.dateKey);
            }
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
          {selectedLabel && (
            <ReferenceLine x={selectedLabel} stroke="#94a3b8" strokeDasharray="3 3" />
          )}
          <XAxis
            dataKey="dateLabel"
            tick={{ fontSize: 9 }}
            interval={Math.max(0, Math.ceil(series.length / 8) - 1)}
            label={{ value: "Dia", position: "insideBottom", offset: -12, fontSize: 10, fill: "#94a3b8" }}
          />
          <YAxis
            domain={yDomain}
            tick={{ fontSize: 9 }}
            width={34}
            tickFormatter={(v) => (typeof v === "number" ? v.toFixed(1) : v)}
            label={{
              value: "Nota",
              angle: -90,
              position: "insideLeft",
              fontSize: 10,
              fill: "#94a3b8",
              style: { textAnchor: "middle" },
            }}
          />
          <Tooltip
            formatter={(value, name) => [typeof value === "number" ? value.toFixed(2) : "-", name]}
          />
          <Line
            type="monotone"
            dataKey="rolling7"
            name="Média 7 dias"
            stroke="#f97316"
            dot={false}
            strokeWidth={2}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="allTime"
            name="All-time"
            stroke="#8b5cf6"
            dot={false}
            strokeWidth={2}
            strokeDasharray="4 3"
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-3 text-[10px] text-slate-500 -mt-1">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-0.5" style={{ background: "#f97316" }} />
          Média 7 dias
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-0.5" style={{ background: "#8b5cf6" }} />
          All-time
        </span>
      </div>
    </div>
  );
}
