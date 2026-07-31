import { NextRequest, NextResponse } from "next/server";
import { processarWebhookChannex } from "@praxis/core";

// Endpoint de webhook da Channex — configurar em staging.channex.io
// (Organisation > Webhooks > Global, ver docs.channex.io/api-v.1-
// documentation/webhook-collection) apontando pra
// https://sistemaspraxis.com.br/api/channel-manager/channex/webhook, com
// event_mask "booking" (cobre new/modified/cancelled) e o header
// X-Channex-Webhook-Secret preenchido com o mesmo valor de
// CHANNEX_WEBHOOK_SECRET daqui.
//
// GLOBAL, não por property: um endpoint só cobre todos os tenants — cada
// evento é resolvido pro tenant certo dentro de processarWebhookChannex via
// ChannexPropertyMapping. Isso evita ter que recadastrar um webhook por
// hotel toda vez que um tenant novo entra.
//
// Sem sessão — a Channex confirma na doc deles que não assina o payload
// (sem HMAC tipo Stripe/GitHub), então a autenticação é um segredo
// compartilhado num header customizado, exatamente como a doc deles
// recomenda (mesmo raciocínio de CRON_SECRET nas rotas de cron da suíte).
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-channex-webhook-secret");
  if (!process.env.CHANNEX_WEBHOOK_SECRET || secret !== process.env.CHANNEX_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  try {
    await processarWebhookChannex(body);
  } catch (err) {
    // Loga mas responde 200 mesmo assim — mesmo raciocínio do webhook do
    // Stripe (ver apps/gateway/.../stripe/webhook/route.ts): um erro do
    // nosso lado não deveria fazer a Channex reagendar o mesmo evento por
    // até ~24h (ver lógica de retry na doc de Webhooks da Channex).
    console.error("[channex-webhook] erro ao processar evento", body?.event, err);
  }

  return NextResponse.json({ received: true });
}
