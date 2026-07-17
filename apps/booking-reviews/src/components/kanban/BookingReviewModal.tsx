"use client";

import { useState, useTransition } from "react";
import { registerBookingReviewAction } from "@/app/(app)/tratamento/actions";
import { unwrapSafeAction } from "@/lib/safeAction";
import type { PropertyOption } from "./types";

// Portado de apps/booking-reviews/src/components/kanban/BookingReviewModal.tsx
// (v1) — uhs/uhId (UHOption) → properties/propertyId (PropertyOption), agora
// que Review se associa a Property (não a UH — Booking só informa a
// propriedade/anúncio, nunca a UH específica).
export function BookingReviewModal({
  properties,
  onClose,
}: {
  properties: PropertyOption[];
  onClose: () => void;
}) {
  const [guestName, setGuestName] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [checkInDate, setCheckInDate] = useState("");
  const [ratingRaw, setRatingRaw] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!propertyId) {
      setError("Selecione a propriedade.");
      return;
    }
    const rating = Number(ratingRaw.replace(",", "."));
    if (Number.isNaN(rating) || rating < 0 || rating > 10) {
      setError("Informe uma nota válida entre 0 e 10.");
      return;
    }

    startTransition(async () => {
      try {
        unwrapSafeAction(
          await registerBookingReviewAction({
            guestName,
            propertyId,
            checkInDate,
            ratingRaw: rating,
            comment,
          })
        );
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao registrar avaliação.");
      }
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-800">Registrar avaliação Booking</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">
            ✕
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-4">
          Confira na extranet da Booking e digite aqui o que você viu. A nota é convertida
          automaticamente da escala 0–10 (Booking) para 0–5.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Nome do hóspede
            </label>
            <input
              type="text"
              required
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
              placeholder="Ex: Maria Silva"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Propriedade</label>
            <select
              required
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
            >
              <option value="">Selecione...</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            {properties.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                Nenhuma propriedade cadastrada. Cadastre em Configurações (gateway) antes de registrar.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Data do check-in
            </label>
            <input
              type="date"
              required
              value={checkInDate}
              onChange={(e) => setCheckInDate(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Nota (0 a 10, como aparece na Booking)
            </label>
            <input
              type="text"
              inputMode="decimal"
              required
              value={ratingRaw}
              onChange={(e) => setRatingRaw(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
              placeholder="Ex: 8.7"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Comentário do hóspede
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
              placeholder="Copie/cole o comentário do hóspede (opcional)"
            />
          </div>

          {error && (
            <div className="text-xs bg-red-50 border border-red-200 text-red-700 rounded-md px-2 py-1.5">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-3 py-1.5 rounded-md text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="text-sm bg-blue-600 text-white rounded-md px-4 py-1.5 hover:bg-blue-700 disabled:opacity-60"
            >
              {isPending ? "Salvando..." : "Registrar avaliação"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
