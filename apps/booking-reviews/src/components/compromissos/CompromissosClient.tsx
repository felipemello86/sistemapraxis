"use client";

// Portado de apps/booking-reviews/src/components/compromissos/CompromissosClient.tsx
// (v1) verbatim — não referencia Property/UH, nenhuma mudança de arquitetura
// necessária.

import { useMemo, useState } from "react";
import Link from "next/link";

export type OverdueItem = {
  id: string;
  description: string;
  dueDate: string; // ISO
  reviewId: string;
  guestName: string;
  rating: number;
};

export type DoneItem = {
  id: string;
  description: string;
  dueDate: string; // ISO
  completedAt: string; // ISO
  reviewId: string;
  guestName: string;
  rating: number;
};

export type EfficacyItem = {
  id: string;
  reviewId: string;
  guestName: string;
  scheduledDate: string; // ISO
  completedAt: string | null; // ISO
  wasEffective: boolean | null;
};

type SortDir = "asc" | "desc";
type EfficacyFilter = "all" | "pending" | "effective" | "ineffective";

function SortToggle({ dir, onToggle }: { dir: SortDir; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-1 text-xs font-normal text-slate-400 hover:text-slate-600"
      title="Ordenar por data"
    >
      Data {dir === "asc" ? "↑" : "↓"}
    </button>
  );
}

function sortByDate<T>(items: T[], getDate: (item: T) => string, dir: SortDir): T[] {
  return [...items].sort((a, b) => {
    const cmp = getDate(a).localeCompare(getDate(b));
    return dir === "asc" ? cmp : -cmp;
  });
}

export function CompromissosClient({
  overdueItems,
  doneItems,
  efficacyItems,
}: {
  overdueItems: OverdueItem[];
  doneItems: DoneItem[];
  efficacyItems: EfficacyItem[];
}) {
  const [overdueSort, setOverdueSort] = useState<SortDir>("asc");
  const [doneSort, setDoneSort] = useState<SortDir>("desc");
  const [efficacySort, setEfficacySort] = useState<SortDir>("desc");
  const [efficacyFilter, setEfficacyFilter] = useState<EfficacyFilter>("all");

  const sortedOverdue = useMemo(
    () => sortByDate(overdueItems, (i) => i.dueDate, overdueSort),
    [overdueItems, overdueSort]
  );

  const sortedDone = useMemo(
    () => sortByDate(doneItems, (i) => i.completedAt, doneSort),
    [doneItems, doneSort]
  );

  const filteredEfficacy = useMemo(() => {
    if (efficacyFilter === "all") return efficacyItems;
    if (efficacyFilter === "pending") return efficacyItems.filter((c) => !c.completedAt);
    if (efficacyFilter === "effective")
      return efficacyItems.filter((c) => c.completedAt && c.wasEffective);
    return efficacyItems.filter((c) => c.completedAt && !c.wasEffective);
  }, [efficacyItems, efficacyFilter]);

  const sortedEfficacy = useMemo(
    () => sortByDate(filteredEfficacy, (i) => i.scheduledDate, efficacySort),
    [filteredEfficacy, efficacySort]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
      <section className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col max-h-[calc(100vh-230px)]">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h2 className="text-sm font-semibold text-red-600">
            Ações vencidas ({sortedOverdue.length})
          </h2>
          <SortToggle dir={overdueSort} onToggle={() => setOverdueSort((d) => (d === "asc" ? "desc" : "asc"))} />
        </div>
        <div className="divide-y divide-slate-100 overflow-y-auto min-h-0 flex-1 pr-1">
          {sortedOverdue.map((i) => (
            <Link
              key={i.id}
              href={`/tratamento?reviewId=${i.reviewId}`}
              className="block py-2 px-1 -mx-1 rounded-md hover:bg-slate-50"
            >
              <div className="text-sm text-slate-700">{i.description}</div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs text-red-600">
                  Prazo: {new Date(i.dueDate).toLocaleDateString("pt-BR")}
                </span>
                <span className="text-xs text-slate-400">
                  {i.guestName} ({i.rating.toFixed(2)})
                </span>
              </div>
            </Link>
          ))}
          {sortedOverdue.length === 0 && (
            <p className="py-3 text-sm text-slate-400">Nenhuma ação vencida.</p>
          )}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col max-h-[calc(100vh-230px)]">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h2 className="text-sm font-semibold text-slate-700">
            Ações executadas ({sortedDone.length})
          </h2>
          <SortToggle dir={doneSort} onToggle={() => setDoneSort((d) => (d === "asc" ? "desc" : "asc"))} />
        </div>
        <div className="divide-y divide-slate-100 overflow-y-auto min-h-0 flex-1 pr-1">
          {sortedDone.map((i) => (
            <Link
              key={i.id}
              href={`/tratamento?reviewId=${i.reviewId}`}
              className="block py-2 px-1 -mx-1 rounded-md hover:bg-slate-50"
            >
              <div className="text-sm text-slate-700">{i.description}</div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs text-slate-400">
                  Prazo: {new Date(i.dueDate).toLocaleDateString("pt-BR")} · Execução:{" "}
                  <span className="text-green-600">
                    {new Date(i.completedAt).toLocaleDateString("pt-BR")}
                  </span>
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {i.guestName} ({i.rating.toFixed(2)})
              </div>
            </Link>
          ))}
          {sortedDone.length === 0 && (
            <p className="py-3 text-sm text-slate-400">Nenhuma ação executada ainda.</p>
          )}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col max-h-[calc(100vh-230px)]">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <h2 className="text-sm font-semibold text-slate-700">Avaliações de eficácia</h2>
          <SortToggle dir={efficacySort} onToggle={() => setEfficacySort((d) => (d === "asc" ? "desc" : "asc"))} />
        </div>
        <select
          value={efficacyFilter}
          onChange={(e) => setEfficacyFilter(e.target.value as EfficacyFilter)}
          className="mb-3 shrink-0 text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-slate-50"
        >
          <option value="all">Todas ({efficacyItems.length})</option>
          <option value="pending">Pendentes</option>
          <option value="effective">Efetivas</option>
          <option value="ineffective">Não efetivas</option>
        </select>
        <div className="divide-y divide-slate-100 overflow-y-auto min-h-0 flex-1 pr-1">
          {sortedEfficacy.map((c) => (
            <Link
              key={c.id}
              href={`/tratamento?reviewId=${c.reviewId}`}
              className="block py-2 px-1 -mx-1 rounded-md hover:bg-slate-50"
            >
              <div className="text-sm text-slate-700">{c.guestName}</div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs text-slate-400">
                  {new Date(c.scheduledDate).toLocaleDateString("pt-BR")}
                </span>
                <span className="text-xs">
                  {!c.completedAt && <span className="text-slate-400">pendente</span>}
                  {c.completedAt && c.wasEffective && <span className="text-green-600">efetivo</span>}
                  {c.completedAt && !c.wasEffective && <span className="text-red-600">não efetivo</span>}
                </span>
              </div>
            </Link>
          ))}
          {sortedEfficacy.length === 0 && (
            <p className="py-3 text-sm text-slate-400">Nenhuma avaliação de eficácia encontrada.</p>
          )}
        </div>
      </section>
    </div>
  );
}
