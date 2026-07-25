/**
 * Cobrança recorrente via Stripe Billing — usado só pelo painel admin da
 * Praxis (nunca pelos apps de tenant). Modelo: o admin gera um link de
 * Stripe Checkout (hospedado pelo Stripe, cartão nunca passa pelo nosso
 * servidor) e manda pro cliente por qualquer canal (WhatsApp, e-mail...).
 * Dali em diante o Stripe cobra sozinho a cada período e nos avisa por
 * webhook (POST /api/stripe/webhook, ver apps/gateway) — TenantSubscription
 * e PaymentEvent só são atualizados a partir do que o Stripe confirma,
 * nunca otimisticamente no momento do clique do admin.
 *
 * STRIPE_SECRET_KEY ausente não derruba o app inteiro: só as funções deste
 * arquivo lançam erro, no momento em que são chamadas — assim o resto da
 * suíte (que nunca usa Stripe) continua funcionando mesmo antes de a chave
 * ser configurada (ver getStripeClient()).
 */
import Stripe from "stripe";
import { prisma } from "./prisma";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY não configurado. Crie uma conta Stripe (ou use o modo teste) e defina a chave nas env vars."
    );
  }
  // Versão da API travada na mesma versão do SDK instalado (ver
  // package.json — stripe@14). Atualizar as duas juntas se algum dia
  // precisar de um recurso mais novo da API do Stripe.
  stripeClient = new Stripe(key, { apiVersion: "2023-10-16" });
  return stripeClient;
}

// Vocabulário próprio (em português) pro status de TenantSubscription,
// traduzido a partir do status de Stripe.Subscription — ver comentário no
// schema.prisma sobre os valores possíveis.
function mapStripeStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
    case "trialing":
      return "ATIVA";
    case "past_due":
    case "unpaid":
    case "paused":
      return "INADIMPLENTE";
    case "canceled":
    case "incomplete_expired":
      return "CANCELADA";
    case "incomplete":
    default:
      return "INCOMPLETA";
  }
}

/** Garante que existe uma linha TenantSubscription e um Stripe Customer pro tenant — cria os dois se faltarem. */
async function garantirCustomer(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error("Cliente não encontrado.");

  let sub = await prisma.tenantSubscription.findUnique({ where: { tenantId } });
  if (!sub) {
    sub = await prisma.tenantSubscription.create({ data: { tenantId } });
  }

  if (sub.stripeCustomerId) return sub;

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    name: tenant.name,
    metadata: { tenantId: tenant.id, tenantSlug: tenant.slug },
  });

  return prisma.tenantSubscription.update({
    where: { tenantId },
    data: { stripeCustomerId: customer.id },
  });
}

/**
 * Cria um link de Stripe Checkout (modo assinatura) pro plano escolhido.
 * O admin copia/envia esse link pro cliente — nada é cobrado até o cliente
 * preencher os dados no Checkout hospedado pelo Stripe.
 */
export async function criarLinkDeCheckout(params: {
  tenantId: string;
  planId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const { tenantId, planId, successUrl, cancelUrl } = params;

  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.ativo) throw new Error("Plano inválido ou inativo.");

  const sub = await garantirCustomer(tenantId);
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: sub.stripeCustomerId!,
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    // metadata aqui (e não só no customer) porque o webhook de
    // checkout.session.completed não vem com o customer expandido por
    // padrão — é o jeito mais direto de recuperar o tenantId sem uma
    // chamada extra à API do Stripe.
    metadata: { tenantId },
    subscription_data: { metadata: { tenantId } },
  });

  if (!session.url) throw new Error("Stripe não retornou a URL do Checkout.");

  await prisma.tenantSubscription.update({
    where: { tenantId },
    data: { planId, lastCheckoutUrl: session.url, lastCheckoutCreatedAt: new Date() },
  });

  return session.url;
}

/** Link do Billing Portal do Stripe — o cliente pode ver faturas, trocar cartão ou cancelar sozinho. */
export async function criarLinkDePortal(params: { tenantId: string; returnUrl: string }): Promise<string> {
  const sub = await prisma.tenantSubscription.findUnique({ where: { tenantId: params.tenantId } });
  if (!sub?.stripeCustomerId) {
    throw new Error("Este cliente ainda não tem um cadastro de cobrança no Stripe.");
  }
  const stripe = getStripeClient();
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: params.returnUrl,
  });
  return portalSession.url;
}

/**
 * Processa um evento de webhook já verificado (ver apps/gateway/src/app/
 * api/stripe/webhook/route.ts, que valida a assinatura antes de chamar
 * isto). Idempotente: todo evento vira uma linha em PaymentEvent via
 * upsert por stripeEventId — o Stripe documenta que pode reenviar o mesmo
 * evento mais de uma vez.
 */
export async function processarEventoStripe(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const tenantId = session.metadata?.tenantId;
      if (!tenantId || !session.subscription || !session.customer) break;

      const stripe = getStripeClient();
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      await prisma.tenantSubscription.update({
        where: { tenantId },
        data: {
          stripeSubscriptionId: subscription.id,
          status: mapStripeStatus(subscription.status),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
      });

      await registrarPaymentEvent({
        tenantId,
        event,
        tipo: "CHECKOUT_CONCLUIDO",
        valorCentavos: session.amount_total ?? undefined,
        status: subscription.status,
      });
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const tenantId = subscription.metadata?.tenantId ?? (await tenantIdPorCustomer(subscription.customer));
      if (!tenantId) break;

      await prisma.tenantSubscription.update({
        where: { tenantId },
        data: {
          stripeSubscriptionId: subscription.id,
          status: mapStripeStatus(subscription.status),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
      });

      await registrarPaymentEvent({
        tenantId,
        event,
        tipo: event.type === "customer.subscription.deleted" ? "ASSINATURA_CANCELADA" : "ASSINATURA_ATUALIZADA",
        status: subscription.status,
      });
      break;
    }

    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const tenantId =
        (invoice.subscription_details?.metadata?.tenantId as string | undefined) ??
        (await tenantIdPorCustomer(invoice.customer));
      if (!tenantId) break;

      await registrarPaymentEvent({
        tenantId,
        event,
        tipo: event.type === "invoice.paid" ? "FATURA_PAGA" : "FATURA_FALHOU",
        valorCentavos: invoice.amount_paid || invoice.amount_due,
        status: invoice.status ?? undefined,
        stripeInvoiceId: invoice.id,
      });
      break;
    }

    default:
      // Eventos que não precisamos tratar hoje — ignorados de propósito
      // (o endpoint sempre responde 200 pro Stripe não ficar reenviando).
      break;
  }
}

async function tenantIdPorCustomer(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): Promise<string | null> {
  if (!customer) return null;
  const customerId = typeof customer === "string" ? customer : customer.id;
  const sub = await prisma.tenantSubscription.findUnique({ where: { stripeCustomerId: customerId } });
  return sub?.tenantId ?? null;
}

async function registrarPaymentEvent(params: {
  tenantId: string;
  event: Stripe.Event;
  tipo: string;
  valorCentavos?: number;
  status?: string;
  stripeInvoiceId?: string;
}) {
  const { tenantId, event, tipo, valorCentavos, status, stripeInvoiceId } = params;
  await prisma.paymentEvent.upsert({
    where: { stripeEventId: event.id },
    update: {},
    create: {
      tenantId,
      stripeEventId: event.id,
      stripeInvoiceId,
      tipo,
      valorCentavos,
      status,
      payload: JSON.stringify(event.data.object),
    },
  });
}
