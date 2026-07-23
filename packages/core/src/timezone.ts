// Fuso horário operacional único da suíte: America/Sao_Paulo. Nunca usar
// `new Date()` + `date-fns format(..., "yyyy-MM-dd")` puro pra descobrir
// "qual é a data de hoje" em código de servidor — o runtime Node da Vercel
// roda em UTC, e Brasília é UTC-3. Entre ~21h e meia-noite (horário de
// Brasília) o relógio UTC já virou o dia seguinte, então esse cálculo
// silenciosamente retorna a data de AMANHÃ em vez de hoje, todo dia, nessa
// janela de ~3h — bug real encontrado em produção em apps/housekeeping
// (camareira via "Nenhuma UH atribuída para hoje" com atribuições reais no
// banco). Promovido pra @praxis/core porque o módulo de Manutenção (fluxo de
// Correção, compromisso diário, cron de "resultado diário" às 19h) precisa
// do mesmo cálculo — ver apps/housekeeping/src/lib/timezone.ts, que
// continua existindo local por já estar em uso ali; esta cópia compartilhada
// é pra código novo.
export function dataAtualSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function horaAtualSP(): string {
  return new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  });
}
