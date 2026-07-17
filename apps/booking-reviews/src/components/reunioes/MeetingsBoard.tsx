"use client";

// Portado de apps/booking-reviews/src/components/reunioes/MeetingsBoard.tsx
// (v1) verbatim.

import { useMemo, useState } from "react";
import { format, isSameDay } from "date-fns";
import { localDayFromDateOnly } from "@/lib/dateOnly";
import { CreateMeetingModal } from "./CreateMeetingModal";
import { MeetingCalendar } from "./MeetingCalendar";
import { MeetingDetailDrawer } from "./MeetingDetailDrawer";
import type { Meeting, MeetingUserOption } from "./types";

export function MeetingsBoard({
  meetings,
  users,
  currentUserRole,
  currentUserId,
}: {
  meetings: Meeting[];
  users: MeetingUserOption[];
  currentUserRole: string;
  currentUserId: string;
}) {
  const canCreate = currentUserRole === "MASTER" || currentUserRole === "GERENTE";

  const [month, setMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const meetingDates = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of meetings) {
      const key = format(localDayFromDateOnly(m.date), "yyyy-MM-dd");
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [meetings]);

  const filteredMeetings = useMemo(() => {
    if (!selectedDate) return meetings;
    return meetings.filter((m) => isSameDay(localDayFromDateOnly(m.date), selectedDate));
  }, [meetings, selectedDate]);

  const selectedMeeting = meetings.find((m) => m.id === selectedMeetingId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Reuniões de Performance</h1>
          <p className="text-sm text-slate-500">
            Histórico de reuniões de performance, com coordenador, participantes, observações e anexos.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="rounded-md bg-blue-600 text-white text-sm font-medium px-4 py-2 hover:bg-blue-700"
          >
            + Nova reunião
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        {/* Lista à esquerda */}
        <div className="space-y-2">
          {filteredMeetings.length === 0 && (
            <p className="text-sm text-slate-400 bg-white border border-slate-200 rounded-xl p-4">
              {selectedDate
                ? "Nenhuma reunião nesse dia."
                : "Nenhuma reunião de performance registrada ainda."}
            </p>
          )}
          {filteredMeetings.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedMeetingId(m.id)}
              className="w-full text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-sm transition"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-slate-800">
                  {localDayFromDateOnly(m.date).toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </span>
                <span className="text-xs text-slate-400">
                  {m.notes.length} obs. · {m.attachments.length} anexo(s)
                </span>
              </div>
              <p className="text-sm text-slate-600">Coordenador: {m.coordinatorName}</p>
              <p className="text-xs text-slate-400 mt-1">
                Participantes:{" "}
                {m.participantNames.length > 0 ? m.participantNames.join(", ") : "nenhum"}
              </p>
            </button>
          ))}
        </div>

        {/* Calendário à direita */}
        <MeetingCalendar
          month={month}
          onMonthChange={setMonth}
          meetingDates={meetingDates}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
      </div>

      {showCreateModal && (
        <CreateMeetingModal
          users={users}
          defaultDate={format(selectedDate ?? new Date(), "yyyy-MM-dd")}
          onClose={() => setShowCreateModal(false)}
          onCreated={(id) => {
            setShowCreateModal(false);
            setSelectedMeetingId(id);
          }}
        />
      )}

      {selectedMeeting && (
        <MeetingDetailDrawer
          meeting={selectedMeeting}
          users={users}
          currentUserRole={currentUserRole}
          currentUserId={currentUserId}
          onClose={() => setSelectedMeetingId(null)}
        />
      )}
    </div>
  );
}
