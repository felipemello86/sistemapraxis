// CRM Fase 2 (30/07/2026) — chamada de envio da WhatsApp Cloud API (Meta).
// Requer as env vars WHATSAPP_TOKEN (token permanente de System User) e
// WHATSAPP_PHONE_NUMBER_ID (Phone Number ID do número dedicado da Praxis) —
// ver checklist de configuração combinado com o Felipe. Sem lib do SDK da
// Meta: é uma chamada HTTP simples, uma dependência nova não se paga aqui.
//
// IMPORTANTE (janela de 24h): a Cloud API só permite mandar texto livre
// dentro de 24h desde a ÚLTIMA mensagem que o contato mandou pra gente. Fora
// dessa janela, só mensagens de template pré-aprovadas pela Meta funcionam
// (não implementado ainda — ver comentário no botão de enviar do
// WhatsAppChat.tsx). Fora da janela, a API responde erro (code 131047) — é
// isso que vira o "erro" retornado abaixo.
const GRAPH_VERSION = "v21.0";

export async function enviarMensagemWhatsApp(
  telefoneDigits: string,
  texto: string
): Promise<{ ok: true; waMessageId: string } | { ok: false; erro: string }> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    return { ok: false, erro: "Integração do WhatsApp não configurada (faltam env vars)." };
  }

  try {
    const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: telefoneDigits,
        type: "text",
        text: { body: texto },
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      const mensagemErro = data?.error?.message ?? "Erro desconhecido da API do WhatsApp.";
      return { ok: false, erro: mensagemErro };
    }

    const waMessageId = data?.messages?.[0]?.id;
    if (!waMessageId) {
      return { ok: false, erro: "Resposta da API sem ID da mensagem." };
    }

    return { ok: true, waMessageId };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha de rede ao chamar a API do WhatsApp." };
  }
}
