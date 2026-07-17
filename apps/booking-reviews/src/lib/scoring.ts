// Portado de apps/booking-reviews/src/lib/scoring.ts (v1) verbatim — lógica
// pura, sem dependência de infra, nada a mudar na migração.

// Normaliza a nota recebida da OTA (ex: Airbnb 0-5) para escala 0-5 por regra de três.
export function normalizeToFiveStars(ratingRaw: number, ratingScaleMax: number) {
  if (ratingScaleMax <= 0) return ratingRaw;
  const normalized = (ratingRaw * 5) / ratingScaleMax;
  return Math.round(normalized * 100) / 100;
}

// Soma dias úteis (seg-sex) a uma data, ignorando feriados (fase 1 não trata feriados).
export function addBusinessDays(start: Date, days: number) {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

export function isBusinessDay(date: Date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}
