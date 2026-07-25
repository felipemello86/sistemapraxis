import { NextRequest, NextResponse } from "next/server";
import { getStripeClient, processarEventoStripe } from "@praxis/core";

// Endpoint de webhook do Stripe — configurar no dashboard do Stripe
// (Developers > Webhooks) apontando pra
// https://sistemaspraxis.com.br/api/stripe/webhook, escutando pelo menos:
// checkout.session.completed, customer.subscription.updated,
// customer.subscription.deleted, invoice.paid, invoice.payment_failed.
//
// Sem sessão nenhuma (nem admin, nem tenant) — a autenticação aqui é a
// assinatura HMAC do próprio Stripe (STRIPE_WEBHOOK_SECRET), verificada
// contra o corpo bruto da requisição. Por isso lemos req.text() em vez de
// req.json(): o corpo já parseado/reserializado não bate mais com a
// assinatura calculada pelo Stripe sobre os bytes originais.
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook não configurado." }, { status: 500 });
  }

  const rawBody = await req.text();

  let event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "assinatura inválida";
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  try {
    await processarEventoStripe(event);
  } catch (err) {
    // Loga mas responde 200 mesmo assim pro Stripe não ficar reenviando em
    // loop por um erro do nosso lado que não vai se resolver sozinho — o
    // evento já está em PaymentEvent (se chegou até lá) ou pode ser
    // investigado direto no dashboard do Stripe pelo event id.
    console.error("[stripe-webhook] erro ao processar evento", event.id, event.type, err);
  }

  return NextResponse.json({ received: true });
}
