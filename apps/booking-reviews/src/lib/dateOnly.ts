// Portado de apps/booking-reviews/src/lib/dateOnly.ts (v1) verbatim.
//
// Campos "só data" (prazo de ação, data agendada de eficácia etc.) são
// gravados como meia-noite UTC — ex: input "2026-07-10" vira
// new Date("2026-07-10") = 2026-07-10T00:00:00.000Z. Isso é correto pra
// guardar, mas ao formatar no navegador com toLocaleDateString/date-fns
// `format`, o JS converte pro fuso horário LOCAL antes de extrair o dia — e
// meia-noite UTC em horário de Brasília (UTC-3) já é 21h do dia anterior,
// então a data aparece um dia a menos.
//
// Essas funções "reancoram" o valor no fuso local mantendo o mesmo
// ano/mês/dia gravado, sem aplicar nenhum deslocamento. Usar só pra campos
// que são de fato "um dia" (sem hora relevante) — timestamps reais (criado
// em, concluído em, etc.) devem continuar usando new Date(...) direto.
export function localDayFromDateOnly(value: string | Date): Date {
  const iso = typeof value === "string" ? value : value.toISOString();
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateOnlyBR(value: string | Date): string {
  return localDayFromDateOnly(value).toLocaleDateString("pt-BR");
}

// true só depois que o dia (local) do prazo já passou por completo — evita
// marcar como vencido algumas horas antes da hora, pelo mesmo motivo do
// deslocamento de fuso explicado acima.
export function isDateOnlyPast(value: string | Date): boolean {
  const day = localDayFromDateOnly(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return day.getTime() < today.getTime();
}
