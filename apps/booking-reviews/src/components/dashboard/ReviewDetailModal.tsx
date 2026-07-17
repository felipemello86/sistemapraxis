"use client";

import Link from "next/link";
import type { ReviewListItem } from "./DashboardClient";

// Portado de apps/booking-reviews/src/components/dashboard/ReviewDetailModal.tsx
// (v1) verbatim — só o link "Ver em Tratamento" usa `review.propertyLabel`,
// que já vem populado com `property.nome` (ver DashboardClient.tsx).

const STAGE_LABEL: Record<string, string> = {
  RECEBIDA: "Avaliação Recebida",
  ANALISE_PLANEJAMENTO: "Análise & Planejamento",
  EXECUCAO: "Execução",
  AVALIACAO_EFICACIA: "Avaliação da Eficácia",
  FINALIZADA: "Finalizada",
};

export function ReviewDetailModal({
  review,
  onClose,
}: {
  review: ReviewListItem;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-lg w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-800">{review.guestName}</h3>
            <p className="text-xs text-slate-400">
              {review.propertyLabel ?? "—"} · {review.platform} ·{" "}
              {new Date(review.guestSubmittedAt).toLocaleDateString("pt-BR")}
            </p>
          </div>
          <span className="text-xl font-bold text-slate-700">
            {review.ratingNormalized.toFixed(2)}
          </span>
        </div>

        <p className="text-sm text-slate-600 whitespace-pre-wrap mb-4">
          {review.comment || "Sem comentário."}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600">
            {STAGE_LABEL[review.stage] ?? review.stage}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-sm px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              Fechar
            </button>
            <Link
              href={`/tratamento?reviewId=${review.id}`}
              className="text-sm px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700"
            >
              Ver em Tratamento
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
