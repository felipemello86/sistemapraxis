/**
 * Notificações via Telegram Bot API.
 *
 * Portado de apps/housekeeping/src/lib/telegram.ts (v1) — MAS só a fatia
 * usada por Relatórios (`enviarRelatorioPDF`), não o módulo inteiro. O v1
 * tem dezenas de funções `notificar*` (atribuição, liberação, inspeção,
 * cobertura de folga, etc.) usadas em vários pontos do app — nenhuma delas
 * foi portada ainda porque as próprias rotas de negócio que as chamariam
 * (atribuicoes, selecao-uhs, etc.) ainda não emitem notificação em v2 (ver
 * TODOs nessas rotas). Portar aqui só o necessário evita criar infra
 * "pendurada" sem chamador.
 *
 * Variável de ambiente necessária (Vercel):
 *   TELEGRAM_BOT_TOKEN – token do bot obtido via @BotFather
 *
 * Para receber o PDF, o destinatário (User.telegramChatId) deve ter
 * iniciado uma conversa com o bot ao menos uma vez.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const API_URL = () => `https://api.telegram.org/bot${BOT_TOKEN}`;

interface SendMessageResult {
  ok: boolean;
  error?: string;
}

export async function enviarRelatorioPDF(
  chatId: string | null | undefined,
  _hotelNome: string,
  dataFormatada: string,
  base64: string,
  fileName: string,
  stats?: { conformidade: number; concluidas: number; total: number; reprovadas: number },
): Promise<SendMessageResult> {
  if (!chatId) {
    console.warn("[Telegram] chatId não configurado para este usuário.");
    return { ok: false, error: "Telegram chatId not set" };
  }
  if (!BOT_TOKEN) {
    console.error("[Telegram] TELEGRAM_BOT_TOKEN não configurado.");
    return { ok: false, error: "Bot token missing" };
  }

  const caption = stats
    ? `📄 <b>Relatório — ${dataFormatada}</b>\n\nConformidade: <b>${Math.round(stats.conformidade)}%</b>\nConcluídas: ${stats.concluidas}/${stats.total}\nReprovadas: ${stats.reprovadas}`
    : `📄 <b>Relatório Gerencial — ${dataFormatada}</b>`;

  try {
    const buffer = Buffer.from(base64, "base64");
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("document", new Blob([buffer], { type: "application/pdf" }), fileName);
    form.append("caption", caption);
    form.append("parse_mode", "HTML");

    const res = await fetch(`${API_URL()}/sendDocument`, { method: "POST", body: form });
    const data = (await res.json()) as Record<string, unknown>;

    if (!data.ok) {
      console.error(`[Telegram] Erro sendDocument → ${chatId}:`, JSON.stringify(data));
      return { ok: false, error: JSON.stringify(data) };
    }
    console.log(`[Telegram] PDF enviado → ${chatId} [${fileName}]`);
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Telegram] Erro de rede (sendDocument):", msg);
    return { ok: false, error: msg };
  }
}
