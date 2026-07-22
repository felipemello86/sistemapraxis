// Fuso horário operacional único do módulo Governança: America/Sao_Paulo.
// Nunca usar `new Date()` + `date-fns format(..., "yyyy-MM-dd")` puro pra
// descobrir "qual é a data de hoje" em código de servidor — o runtime Node
// da Vercel roda em UTC, e Brasília é UTC-3. Entre ~21h e meia-noite
// (horário de Brasília) o relógio UTC já virou o dia seguinte, então esse
// cálculo silenciosamente retorna a data de AMANHÃ em vez de hoje, todo dia,
// nessa janela de ~3h — bug real encontrado em produção em 21/07 (camareira
// via "Nenhuma UH atribuída para hoje" com atribuições reais no banco).
//
// Extraído de lib/late-checkout.ts (onde já existia, mas só localmente) pra
// ser reaproveitado em qualquer rota que precise do "hoje"/"agora" do
// servidor. Formatação client-side (dentro de componentes "use client") não
// tem esse problema — roda no navegador do usuário, já no horário local
// dele — então não precisa deste helper.
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
