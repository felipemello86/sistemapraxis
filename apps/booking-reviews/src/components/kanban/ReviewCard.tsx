"use client";

import { formatDateOnlyBR, isDateOnlyPast } from "@/lib/dateOnly";
import type { KanbanReview } from "./types";

// Portado de apps/booking-reviews/src/components/kanban/ReviewCard.tsx (v1)
// — propertyLabel → propertyNome (Property agora é cadastro real, não texto
// livre).
export function ReviewCard({
  review,
  onClick,
}: {
  review: KanbanReview;
  onClick: () => void;
}) {
  const overdueItems = review.actionItems.filter(
    (i) => !i.completedAt && isDateOnlyPast(i.dueDate)
  ).length;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-slate-200 rounded-lg p-3 hover:shadow-sm hover:border-slate-300 transition"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-medium text-slate-700">{review.guestName}</div>
          <div className="text-xs text-slate-400">
            {review.propertyNome ?? "—"} · {review.platform}
            {review.checkInDate && <> · check-in {formatDateOnlyBR(review.checkInDate)}</>}
          </div>
        </div>
        <span
          className={
            "text-xs font-semibold rounded-full px-2 py-0.5 " +
            (review.ratingNormalized >= 4.5
              ? "bg-green-100 text-green-700"
              : review.ratingNormalized >= 3.5
              ? "bg-amber-100 text-amber-700"
              : "bg-red-100 text-red-700")
          }
        >
          {review.ratingNormalized.toFixed(2)}
        </span>
      </div>
      {overdueItems > 0 && (
        <div className="mt-2 text-[11px] text-red-600 font-medium">
          {overdueItems} ação(ões) vencida(s)
        </div>
      )}
      {review.skippedToFinal && (
        <div className="mt-2 text-[11px] text-green-600 font-medium">
          Nota máxima · finalizada automaticamente
        </div>
      )}
    </button>
  );
}
