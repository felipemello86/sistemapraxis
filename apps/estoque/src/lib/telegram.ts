// Notificação de estoque mínimo via Telegram Bot API.
//
// Decisão explícita do Felipe: o sistema antigo (standalone, fora da suíte)
// alertava por WhatsApp via Evolution API — aqui a reconstrução troca por
// um bot do Telegram, mesmo padrão já usado em housekeeping (relatórios) e
// booking-reviews (alertas de avaliação): `sendMessage` simples pra um
// `chat_id` guardado em `User.telegramChatId`, usando a mesma variável de
// ambiente `TELEGRAM_BOT_TOKEN` (configurar também no deploy Vercel deste
// app — ver .env.example).
//
// Cada pessoa vincula o próprio chat_id conversando com o bot (fluxo de
// vínculo ainda não existe em v2 — ver TODO em movimentos/route.ts; até lá,
// o telegramChatId precisa ser preenchido manualmente, ex.: via
// prisma.user.update ou pela tela de Usuários do gateway).

export async function sendTelegramMessage(chatId: string, message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return; // não configurado — silencioso, não quebra o registro da movimentação

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[Telegram] Falha ao enviar mensagem:", res.status, body);
    }
  } catch (err) {
    // Melhor esforço: um problema no Telegram não pode travar o registro
    // da movimentação de estoque.
    console.error("[Telegram] Erro de rede:", err);
  }
}

/** Alerta pros gestores (Master/Gerente/Governanta com telegramChatId
 * definido, no tenant) de que um produto caiu abaixo do estoque mínimo. */
export async function alertarEstoqueBaixo(params: {
  destinatarios: { telegramChatId: string | null }[];
  produtoNome: string;
  quantidade: number;
  unidade: string;
  estoqueMinimo: number;
}): Promise<void> {
  const { destinatarios, produtoNome, quantidade, unidade, estoqueMinimo } = params;
  const chatIds = destinatarios.map((d) => d.telegramChatId).filter((id): id is string => Boolean(id));
  if (chatIds.length === 0) return;

  const texto =
    `⚠️ <b>Estoque baixo</b>\n\n` +
    `<b>${produtoNome}</b> está com ${quantidade} ${unidade}, abaixo do mínimo (${estoqueMinimo} ${unidade}).`;

  await Promise.all(chatIds.map((chatId) => sendTelegramMessage(chatId, texto)));
}
