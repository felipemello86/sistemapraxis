// Portado de apps/booking-reviews/src/lib/dashboard.ts (v1) verbatim — função
// pura de agregação de série temporal, sem dependência de tenant/Prisma.
import { startOfDay, subDays, format } from "date-fns";

export type ReviewForChart = {
  id: string;
  guestName: string;
  platform: string;
  ratingNormalized: number;
  guestSubmittedAt: Date;
  propertyLabel?: string | null;
};

export type DailyPoint = {
  dateKey: string; // yyyy-MM-dd
  dateLabel: string; // d/M (sem zero à esquerda, sem ano — rótulo curto do eixo X)
  avg: number | null;
  count: number;
  rolling7: number | null;
  rolling30: number | null;
  allTime: number | null;
};

function dayKey(date: Date) {
  return format(startOfDay(date), "yyyy-MM-dd");
}

// Constrói a série diária (média do dia + médias móveis 7d/30d/all-time),
// alinhada pela data em que a avaliação chegou na OTA (guestSubmittedAt).
export function buildDailySeries(
  reviews: ReviewForChart[],
  daysWindow = 30
): DailyPoint[] {
  const today = startOfDay(new Date());
  const start = subDays(today, daysWindow - 1);

  const byDay = new Map<string, number[]>();
  for (const r of reviews) {
    const key = dayKey(r.guestSubmittedAt);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(r.ratingNormalized);
  }

  function avgUpTo(end: Date, windowDays: number | null) {
    const from = windowDays ? subDays(end, windowDays - 1) : null;
    const values: number[] = [];
    for (const r of reviews) {
      const d = startOfDay(r.guestSubmittedAt);
      if (d > end) continue;
      if (from && d < from) continue;
      values.push(r.ratingNormalized);
    }
    if (values.length === 0) return null;
    return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
  }

  const points: DailyPoint[] = [];
  for (let i = 0; i < daysWindow; i++) {
    const d = subDays(today, daysWindow - 1 - i);
    const key = dayKey(d);
    const dayValues = byDay.get(key) ?? [];
    const avg =
      dayValues.length > 0
        ? Math.round((dayValues.reduce((a, b) => a + b, 0) / dayValues.length) * 100) / 100
        : null;

    points.push({
      dateKey: key,
      dateLabel: format(d, "d/M"),
      avg,
      count: dayValues.length,
      rolling7: avgUpTo(d, 7),
      rolling30: avgUpTo(d, 30),
      allTime: avgUpTo(d, null),
    });
  }

  return points;
}
