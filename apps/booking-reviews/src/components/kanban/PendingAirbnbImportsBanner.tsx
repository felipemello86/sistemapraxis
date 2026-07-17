"use client";

import { useState, useTransition } from "react";
import {
  dismissPendingAirbnbImportAction,
  resolvePendingAirbnbImportAction,
} from "@/app/(app)/tratamento/actions";
import { formatDateOnlyBR } from "@/lib/dateOnly";
import { unwrapSafeAction } from "@/lib/safeAction";
import type { PendingAirbnbImportItem, PropertyOption } from "./types";

// Portado de apps/booking-reviews/src/components/kanban/PendingAirbnbImportsBanner.tsx
// (v1) — uhId/UHOption → propertyId/PropertyOption. Avaliações do Airbnb
// coletadas automaticamente, mas cujo e-mail não bateu com nenhuma
// propriedade cadastrada — como Property é obrigatória em todo card, elas
// ficam aqui até Gerente/Master atribuir manualmente (a uma propriedade já
// cadastrada — esta tela nunca cria propriedade nova).
export function PendingAirbnbImportsBanner({
  pendingImports,
  properties,
}: {
  pendingImports: PendingAirbnbImportItem[];
  properties: PropertyOption[];
}) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-amber-800">
          {pendingImports.length} avaliação(ões) do Airbnb aguardando propriedade
        </h2>
        <p className="text-xs text-amber-700">
          O e-mail não permitiu identificar a propriedade automaticamente. Atribua abaixo pra
          elas virarem cards no Kanban.
        </p>
      </div>
      <div className="space-y-2">
        {pendingImports.map((item) => (
          <PendingRow key={item.id} item={item} properties={properties} />
        ))}
      </div>
    </div>
  );
}

function PendingRow({
  item,
  properties,
}: {
  item: PendingAirbnbImportItem;
  properties: PropertyOption[];
}) {
  const [propertyId, setPropertyId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleResolve() {
    if (!propertyId) {
      setError("Selecione a propriedade.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        unwrapSafeAction(await resolvePendingAirbnbImportAction(item.id, propertyId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao atribuir propriedade.");
      }
    });
  }

  function handleDismiss() {
    if (!confirm(`Descartar a avaliação de ${item.guestName} sem criar o card?`)) return;
    setError(null);
    startTransition(async () => {
      try {
        unwrapSafeAction(await dismissPendingAirbnbImportAction(item.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao descartar.");
      }
    });
  }

  return (
    <div className="bg-white border border-amber-200 rounded-md p-2 flex flex-wrap items-center gap-2">
      <div className="flex-1 min-w-[160px] text-sm">
        <div className="text-slate-700">{item.guestName}</div>
        <div className="text-xs text-slate-400">
          {new Date(item.guestSubmittedAt).toLocaleDateString("pt-BR")} · {item.ratingRaw.toFixed(1)}★
          {item.checkInDate && <> · check-in {formatDateOnlyBR(item.checkInDate)}</>}
        </div>
      </div>
      <select
        value={propertyId}
        onChange={(e) => setPropertyId(e.target.value)}
        className="text-sm border border-slate-300 rounded-md px-2 py-1.5"
      >
        <option value="">Selecione a propriedade...</option>
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </select>
      <button
        disabled={isPending}
        onClick={handleResolve}
        className="text-xs rounded-md bg-blue-600 text-white px-3 py-1.5 hover:bg-blue-700 disabled:opacity-60"
      >
        Criar card
      </button>
      <button
        disabled={isPending}
        onClick={handleDismiss}
        className="text-xs text-slate-400 hover:text-red-600"
      >
        descartar
      </button>
      {error && <div className="w-full text-xs text-red-600">{error}</div>}
    </div>
  );
}
