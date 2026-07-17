"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  STAGES,
  type Attendant,
  type CategoryOption,
  type KanbanReview,
  type PendingAirbnbImportItem,
  type PropertyOption,
} from "./types";
import { ReviewCard } from "./ReviewCard";
import { CardDetailDrawer } from "./CardDetailDrawer";
import { BookingReviewModal } from "./BookingReviewModal";
import { PendingAirbnbImportsBanner } from "./PendingAirbnbImportsBanner";
import { runAirbnbCollectionAction } from "@/app/(app)/tratamento/actions";

// Portado de apps/booking-reviews/src/components/kanban/KanbanBoard.tsx (v1)
// — uhs/uhId (UHOption) → properties/propertyId (PropertyOption). Review se
// associa a Property, não a UH (Booking/Airbnb só informam a
// propriedade/anúncio, nunca a UH específica onde o hóspede ficou).
export function KanbanBoard({
  reviews,
  attendants,
  categories,
  properties,
  pendingImports,
  currentUserRole,
  currentUserId,
}: {
  reviews: KanbanReview[];
  attendants: Attendant[];
  categories: CategoryOption[];
  properties: PropertyOption[];
  pendingImports: PendingAirbnbImportItem[];
  currentUserRole: string;
  currentUserId: string;
}) {
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAirbnbPending, startAirbnbTransition] = useTransition();
  const [airbnbMessage, setAirbnbMessage] = useState<string | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<string>("");
  const [propertyFilter, setPropertyFilter] = useState<string>("");
  const canManage = currentUserRole === "GERENTE" || currentUserRole === "MASTER";

  useEffect(() => {
    const fromUrl = searchParams.get("reviewId");
    if (fromUrl) setSelectedId(fromUrl);
  }, [searchParams]);

  const scopedReviews = useMemo(
    () =>
      reviews.filter(
        (r) =>
          (!platformFilter || r.platform === platformFilter) &&
          (!propertyFilter || r.propertyId === propertyFilter)
      ),
    [reviews, platformFilter, propertyFilter]
  );

  const byStage = useMemo(() => {
    const map = new Map<string, KanbanReview[]>();
    for (const stage of STAGES) map.set(stage.key, []);
    for (const r of scopedReviews) map.get(r.stage)?.push(r);
    return map;
  }, [scopedReviews]);

  const selectedReview = reviews.find((r) => r.id === selectedId) ?? null;

  function handleAirbnbRun() {
    startAirbnbTransition(async () => {
      const result = await runAirbnbCollectionAction();
      setAirbnbMessage(result.message);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Tratamento</h1>
          <p className="text-sm text-slate-500">Fluxo de análise das avaliações recebidas.</p>
        </div>
        {(currentUserRole === "GERENTE" || currentUserRole === "MASTER") && (
          <div className="flex gap-2">
            <button
              onClick={handleAirbnbRun}
              disabled={isAirbnbPending}
              className="rounded-md bg-rose-600 text-white text-sm font-medium px-4 py-2 hover:bg-rose-700 disabled:opacity-60"
            >
              {isAirbnbPending ? "Buscando..." : "▶ Coletar Airbnb"}
            </button>
            <button
              onClick={() => setShowBookingModal(true)}
              className="rounded-md bg-blue-600 text-white text-sm font-medium px-4 py-2 hover:bg-blue-700"
            >
              + Registrar avaliação Booking
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div>
          <label className="block text-[11px] text-slate-400 mb-0.5">Plataforma</label>
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white"
          >
            <option value="">Todas</option>
            <option value="AIRBNB">Airbnb</option>
            <option value="BOOKING">Booking</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] text-slate-400 mb-0.5">Propriedade</label>
          <select
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
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
        {(platformFilter || propertyFilter) && (
          <button
            onClick={() => {
              setPlatformFilter("");
              setPropertyFilter("");
            }}
            className="text-xs text-blue-600 hover:underline self-end mb-1.5"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {airbnbMessage && (
        <div className="text-sm bg-rose-50 border border-rose-200 text-rose-700 rounded-md px-3 py-2">
          {airbnbMessage}
        </div>
      )}

      {canManage && pendingImports.length > 0 && (
        <PendingAirbnbImportsBanner pendingImports={pendingImports} properties={properties} />
      )}

      {showBookingModal && (
        <BookingReviewModal properties={properties} onClose={() => setShowBookingModal(false)} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-start">
        {STAGES.map((stage) => (
          <div
            key={stage.key}
            className="bg-slate-100 rounded-xl p-3 flex flex-col min-h-[200px] max-h-[clamp(400px,calc(100vh-230px),1600px)]"
          >
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                {stage.label}
              </h3>
              <span className="text-xs text-slate-400">
                {byStage.get(stage.key)?.length ?? 0}
              </span>
            </div>
            <div className="space-y-2 overflow-y-auto min-h-0 pr-1">
              {(byStage.get(stage.key) ?? []).map((review) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  onClick={() => setSelectedId(review.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {selectedReview && (
        <CardDetailDrawer
          review={selectedReview}
          attendants={attendants}
          categories={categories}
          properties={properties}
          currentUserRole={currentUserRole}
          currentUserId={currentUserId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
