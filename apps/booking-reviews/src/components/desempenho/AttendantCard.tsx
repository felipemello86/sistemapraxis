"use client";

// Portado de apps/booking-reviews/src/components/desempenho/AttendantCard.tsx
// (v1) verbatim.

import { useMemo, useState } from "react";
import Link from "next/link";
import { buildDailySeries } from "@/lib/dashboard";
import { AttendantChart } from "./AttendantChart";

export type AttendantScoreItem = {
  id: string;
  reviewId: string;
  guestName: string;
  platform: string;
  observation: string;
  score: number;
  guestSubmittedAt: string; // ISO
};

function dateKeyFromIso(iso: string) {
  return iso.slice(0, 10);
}

export function AttendantCard({ name, scores }: { name: string; scores: AttendantScoreItem[] }) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const avg =
    scores.length > 0 ? scores.reduce((acc, s) => acc + s.score, 0) / scores.length : null;

  const series = useMemo(
    () =>
      buildDailySeries(
        scores.map((s) => ({
          id: s.reviewId,
          guestName: s.guestName,
          platform: s.platform,
          ratingNormalized: s.score,
          guestSubmittedAt: new Date(s.guestSubmittedAt),
        })),
        30
      ),
    [scores]
  );

  // Clicar num dia do gráfico filtra a lista abaixo pelas avaliações
  // daquele dia — clicar de novo no mesmo dia limpa o filtro.
  const visibleScores = useMemo(() => {
    if (!selectedDay) return scores;
    return scores.filter((s) => dateKeyFromIso(s.guestSubmittedAt) === selectedDay);
  }, [scores, selectedDay]);

  const selectedDayLabel = series.find((p) => p.dateKey === selectedDay)?.dateLabel ?? null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-semibold">
            {name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-700">{name}</div>
            <div className="text-xs text-slate-400">
              {scores.length > 0 ? `${scores.length} avaliações` : "sem avaliações"}
            </div>
          </div>
        </div>
        {avg !== null && (
          <div className="text-right shrink-0">
            <div
              className={
                "text-2xl font-bold leading-none " +
                (avg >= 4.5 ? "text-green-600" : avg >= 3.5 ? "text-amber-600" : "text-red-600")
              }
            >
              {avg.toFixed(2)} <span className="text-base align-top">★</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">nota atual</div>
          </div>
        )}
      </div>

      <AttendantChart series={series} selectedDay={selectedDay} onSelectDay={setSelectedDay} />

      {selectedDay && (
        <button
          onClick={() => setSelectedDay(null)}
          className="text-xs text-blue-600 hover:underline mb-2"
        >
          Limpar filtro ({selectedDayLabel})
        </button>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {visibleScores.map((s) => (
          <Link
            key={s.id}
            href={`/tratamento?reviewId=${s.reviewId}`}
            className="block text-sm border-t border-slate-100 pt-2 pb-1 px-1 -mx-1 rounded-md hover:bg-slate-50"
          >
            <div className="flex items-center justify-between">
              <span className="text-slate-600">{s.guestName}</span>
              <span className="font-semibold text-slate-700">{s.score.toFixed(1)} ★</span>
            </div>
            <p className="text-xs text-slate-500">{s.observation}</p>
          </Link>
        ))}
        {visibleScores.length === 0 && (
          <p className="text-xs text-slate-400">
            {selectedDay ? "Nenhuma avaliação nesse dia." : "Nenhuma avaliação registrada ainda."}
          </p>
        )}
      </div>
    </div>
  );
}
