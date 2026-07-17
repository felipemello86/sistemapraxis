"use client";

// Portado de apps/booking-reviews/src/components/reunioes/CreateMeetingModal.tsx
// (v1) — só o handleSubmit muda: saveMeetingAction agora devolve um
// SafeActionResult (ver src/lib/safeAction.ts), então precisa de
// unwrapSafeAction pra extrair o id da reunião criada ou relançar o erro de
// validação de verdade.

import { useState, useTransition } from "react";
import { saveMeetingAction } from "@/app/(app)/reunioes/actions";
import { unwrapSafeAction } from "@/lib/safeAction";
import type { MeetingUserOption } from "./types";

export function CreateMeetingModal({
  users,
  defaultDate,
  onClose,
  onCreated,
}: {
  users: MeetingUserOption[];
  defaultDate: string; // YYYY-MM-DD
  onClose: () => void;
  onCreated: (meetingId: string) => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [coordinatorId, setCoordinatorId] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleParticipant(id: string) {
    setParticipantIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      try {
        const id = unwrapSafeAction(await saveMeetingAction({ date, coordinatorId, participantIds }));
        onCreated(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao criar reunião.");
      }
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl p-5 w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-slate-800 mb-4">Nova reunião de performance</h2>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-3">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Data</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Coordenador</label>
            <select
              value={coordinatorId}
              onChange={(e) => setCoordinatorId(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
            >
              <option value="">Selecione...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Participantes</label>
            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-md p-2 space-y-1">
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={participantIds.includes(u.id)}
                    onChange={() => toggleParticipant(u.id)}
                  />
                  {u.name}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            disabled={isPending || !date || !coordinatorId}
            onClick={handleSubmit}
            className="flex-1 rounded-md bg-blue-600 text-white text-sm font-medium py-2 hover:bg-blue-700 disabled:opacity-60"
          >
            {isPending ? "Criando..." : "Criar reunião"}
          </button>
          <button
            disabled={isPending}
            onClick={onClose}
            className="rounded-md border border-slate-300 text-slate-600 text-sm font-medium px-4 py-2 hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
