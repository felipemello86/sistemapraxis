"use client";

// Portado de apps/booking-reviews/src/components/reunioes/MeetingCalendar.tsx
// (v1) verbatim.

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

export function MeetingCalendar({
  month,
  onMonthChange,
  meetingDates,
  selectedDate,
  onSelectDate,
}: {
  month: Date;
  onMonthChange: (month: Date) => void;
  meetingDates: Map<string, number>; // "yyyy-MM-dd" -> quantidade de reuniões
  selectedDate: Date | null;
  onSelectDate: (date: Date | null) => void;
}) {
  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => onMonthChange(subMonths(month, 1))}
          className="text-slate-400 hover:text-slate-700 px-2"
          aria-label="Mês anterior"
        >
          ‹
        </button>
        <h3 className="text-sm font-semibold text-slate-700 capitalize">
          {format(month, "MMMM yyyy", { locale: ptBR })}
        </h3>
        <button
          onClick={() => onMonthChange(addMonths(month, 1))}
          className="text-slate-400 hover:text-slate-700 px-2"
          aria-label="Próximo mês"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {WEEKDAY_LABELS.map((d, i) => (
          <div key={i} className="text-[10px] font-medium text-slate-400 py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const count = meetingDates.get(key) ?? 0;
          const inMonth = isSameMonth(day, month);
          const selected = selectedDate && isSameDay(day, selectedDate);

          return (
            <button
              key={key}
              onClick={() => onSelectDate(selected ? null : day)}
              className={
                "relative aspect-square rounded-md text-xs flex flex-col items-center justify-center gap-0.5 " +
                (!inMonth ? "text-slate-300" : "text-slate-700") +
                (selected ? " bg-blue-600 text-white" : " hover:bg-slate-100") +
                (isToday(day) && !selected ? " ring-1 ring-blue-400" : "")
              }
            >
              <span>{format(day, "d")}</span>
              {count > 0 && (
                <span
                  className={
                    "w-1.5 h-1.5 rounded-full " + (selected ? "bg-white" : "bg-blue-500")
                  }
                />
              )}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <button
          onClick={() => onSelectDate(null)}
          className="mt-3 text-xs text-blue-600 hover:underline"
        >
          Limpar filtro ({format(selectedDate, "dd/MM/yyyy")})
        </button>
      )}
    </div>
  );
}
