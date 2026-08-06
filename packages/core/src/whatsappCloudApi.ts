// Chamadas de servidor-pra-servidor da WhatsApp Cloud API (Meta) usadas
// pelo fluxo de Embedded Signup (06/08/2026) — cada tenant conecta o
// PRÓPRIO número aqui, diferente do número único do CRM do admin (que
// continua lendo WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID direto das env
// vars, sem passar por nada disso — ver apps/gateway/src/app/admin/crm/
// whatsapp.ts, propositalmente intocado).
//
// Toda troca de código por token e toda chamada com o token de um tenant
// específico acontece SÓ aqui no servidor (Server Actions/Route Handlers)
// — nunca no client. Ver documentação oficial: "Perform all of the
// requests described below using server-to-server requests."
const GRAPH_VERSION = "v21.0";

export type WhatsAppApiResult<T> = { ok: true; data: T } | { ok: false; erro: string };

async function chamarGraphApi<T>(url: string, init?: RequestInit): Promise<WhatsAppApiResult<T>> {
  try {
    const resp = await fetch(url, init);
    const data = (await resp.json()) as any;
    if (!resp.ok) {
      return { ok: false, erro: data?.error?.message ?? `Erro ${resp.status} da API da Meta.` };
    }
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha de rede ao chamar a API da Meta." };
  }
}

// Troca o `code` (retornado pelo popup de Embedded Signup, válido só por
// ~30s) por um token de acesso de negócio. Sem redirect_uri — o Embedded
// Signup é um fluxo via popup/JS SDK, não OAuth clássico por redirect.
export async function trocarCodePorToken(
  appId: string,
  appSecret: string,
  code: string
): Promise<WhatsAppApiResult<{ access_token: string }>> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${code}`;
  return chamarGraphApi(url);
}

// Passo obrigatório do onboarding (não opcional, ver docs oficiais): sem
// isso, a Meta nunca manda webhook nenhum (nem status, nem mensagem
// recebida) pros eventos dessa WABA — mesmo bug que já debugamos no
// número único do admin (ver comentário em ../../apps/gateway/.../
// webhook/route.ts sobre "subscribed_apps").
export async function inscreverWebhookWaba(token: string, wabaId: string): Promise<WhatsAppApiResult<{ success: boolean }>> {
  return chamarGraphApi(`https://graph.facebook.com/${GRAPH_VERSION}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function buscarInfoNumero(
  token: string,
  phoneNumberId: string
): Promise<WhatsAppApiResult<{ display_phone_number?: string; verified_name?: string }>> {
  return chamarGraphApi(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
}

// Registra o número na Cloud API (ativa envio/recebimento de verdade) —
// mesmo passo que resolveu o erro (#133010) no número único do admin.
// PIN gerado aqui mesmo (aleatório, 6 dígitos) — o tenant nunca precisa
// escolher/saber desse PIN, é só um detalhe interno da conta.
export async function registrarNumero(
  token: string,
  phoneNumberId: string,
  pin: string
): Promise<WhatsAppApiResult<{ success: boolean }>> {
  return chamarGraphApi(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
}

export function gerarPinAleatorio(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Envio de mensagem de texto livre — genérico (recebe token/phoneNumberId
// explícitos em vez de ler env var), usado tanto por um wrapper do CRM do
// admin (lendo WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID) quanto pelo módulo
// Vendas do tenant (lendo do ChannelConnection cifrado). Mesma regra da
// janela de 24h de sempre — ver comentário original em admin/crm/whatsapp.ts.
export async function enviarMensagemWhatsAppCloudApi(
  token: string,
  phoneNumberId: string,
  telefoneDigits: string,
  texto: string
): Promise<{ ok: true; waMessageId: string } | { ok: false; erro: string }> {
  const resultado = await chamarGraphApi<{ messages?: { id: string }[] }>(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: telefoneDigits, type: "text", text: { body: texto } }),
    }
  );
  if (!resultado.ok) return resultado;
  const waMessageId = resultado.data.messages?.[0]?.id;
  if (!waMessageId) return { ok: false, erro: "Resposta da API sem ID da mensagem." };
  return { ok: true, waMessageId };
}
