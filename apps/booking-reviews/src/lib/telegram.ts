// Portado de apps/booking-reviews/src/lib/telegram.ts (v1) — só a fatia
// usada por lib/alerts.ts (sendTelegramMessage). `generateTelegramLinkCode`
// e `ensureTelegramWebhook` (vínculo de conta em Configurações + webhook)
// ficam pra quando esses blocos forem portados — não têm chamador ainda
// aqui, e o webhook v1 tinha uma URL default hardcoded (bnb-reviews.vercel.app)
// que precisa ser revista pro domínio v2 de qualquer forma.
//
// Configuração necessária (Vercel, mesmo bot do v1): TELEGRAM_BOT_TOKEN.

export async function sendTelegramMessage(chatId: string, message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return; // não configurado — silencioso, não quebra o fluxo principal

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("Falha ao enviar mensagem no Telegram:", res.status, body);
    }
  } catch (err) {
    // Melhor esforço: um problema no Telegram não pode travar a ação do
    // usuário (mover card, salvar análise, etc.).
    console.error("Erro ao enviar mensagem no Telegram:", err);
  }
}
