/**
 * Fase 1 do plano de channel manager (ver
 * praxis-pms-channel-manager-plano.md) — importação de reserva vinda da
 * Channex (channex.io), somente leitura: a reserva chega por webhook, viramos
 * Reserva/Hospede no nosso schema, e confirmamos recebimento pra Channex
 * (ack). Nada aqui empurra dado pra Channex ainda (disponibilidade/tarifa
 * são Fase 2/3) — e nada aqui sabe alocar UH específica (isso é Fase 4, ver
 * comentário em Reserva.uhId no schema.prisma).
 *
 * Autenticação de saída (nós → Channex): header `user-api-key`
 * (CHANNEX_API_KEY, gerada em staging.channex.io > Organisation > API Keys).
 *
 * Autenticação de entrada (Channex → nós, webhook): a Channex confirma na
 * própria documentação que não assina o payload (sem HMAC tipo
 * Stripe/GitHub) — por isso seguimos a recomendação oficial deles de um
 * header de segredo compartilhado (CHANNEX_WEBHOOK_SECRET), configurado
 * igual dos dois lados: aqui e no campo "headers" do webhook cadastrado no
 * dashboard da Channex (ver apps/gateway/.../channel-manager/channex/
 * webhook/route.ts, que valida esse header antes de chamar
 * processarWebhookChannex).
 *
 * Mapeamento tenant↔property e room-type↔tipo-de-UH fica isolado em
 * ChannexPropertyMapping/ChannexRoomMapping (ver schema.prisma) — são as
 * duas únicas tabelas do domínio que sabem que a Channex existe, por
 * desenho (ver princípio arquitetural na seção 2 do plano: trocar de
 * fornecedor um dia deveria custar só reescrever este arquivo).
 */
import { prisma } from "../prisma";

const CHANNEX_BASE_URL = process.env.CHANNEX_BASE_URL || "https://staging.channex.io/api/v1";

function getApiKey(): string {
  const key = process.env.CHANNEX_API_KEY;
  if (!key) {
    throw new Error(
      "CHANNEX_API_KEY não configurado. Gere uma API Key em staging.channex.io (Organisation > API Keys) e defina nas env vars."
    );
  }
  return key;
}

async function channexFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CHANNEX_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "user-api-key": getApiKey(),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Channex API ${res.status} em ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ---- Shape da Booking Revision da Channex -------------------------------
// Campos confirmados na doc oficial (docs.channex.io/api-v.1-documentation/
// bookings-collection) — só os que efetivamente usamos abaixo. A doc deles
// tem bem mais campos (guarantee/cartão, taxes, services, meta por OTA)
// que ignoramos de propósito nesta fase (somente leitura de reserva, sem
// folio/pagamento ainda — isso é Fase 4/6).
export type ChannexBookingRevision = {
  id: string; // id da própria revisão
  property_id: string;
  booking_id: string;
  unique_id: string; // ex.: "BDC-3333333333" (Booking.com), "ABB-..." (Airbnb) — combina OTA + código, estável entre revisões de uma mesma reserva
  ota_name: string; // "BookingCom" | "Airbnb" | "A-Expedia" | ...
  status: "new" | "modified" | "cancelled";
  arrival_date: string; // YYYY-MM-DD
  departure_date: string; // YYYY-MM-DD
  amount?: string;
  currency?: string;
  occupancy?: { adults?: number; children?: number; infants?: number };
  customer?: {
    name?: string | null;
    surname?: string | null;
    mail?: string | null;
    phone?: string | null;
  };
  rooms?: Array<{
    room_type_id: string | null;
    rate_plan_id: string | null;
    checkin_date?: string;
    checkout_date?: string;
  }>;
};

// ---- Booking Revision Feed ----------------------------------------------

/** Lista revisões de reserva ainda não confirmadas (ack) — usar como fallback/varredura; o fluxo normal é reagir ao webhook. */
export async function buscarRevisoesNaoConfirmadas(propertyId?: string): Promise<ChannexBookingRevision[]> {
  const query = propertyId ? `?filter[property_id]=${propertyId}` : "";
  const res = await channexFetch<{ data: Array<{ id: string; attributes: ChannexBookingRevision }> }>(
    `/booking_revisions/feed${query}`
  );
  return res.data.map((d) => ({ ...d.attributes, id: d.id }));
}

export async function buscarRevisaoPorId(revisionId: string): Promise<ChannexBookingRevision> {
  const res = await channexFetch<{ data: { id: string; attributes: ChannexBookingRevision } }>(
    `/booking_revisions/${revisionId}`
  );
  return { ...res.data.attributes, id: res.data.id };
}

/**
 * Confirma o recebimento de uma revisão. Obrigatório: a Channex reenvia a
 * mesma revisão no feed por até 30 minutos sem ack, e manda e-mail de aviso
 * depois disso (ver doc de Booking Revisions Feed) — sempre chamar isto
 * depois de aplicar a revisão com sucesso.
 */
export async function confirmarRevisao(revisionId: string): Promise<void> {
  await channexFetch(`/booking_revisions/${revisionId}/ack`, { method: "POST" });
}

// ---- Canal (OTA) ----------------------------------------------------------

function normalizarCanal(otaName: string | undefined): string {
  const nome = (otaName || "").toUpperCase();
  if (nome.includes("AIRBNB")) return "AIRBNB";
  if (nome.includes("BOOKING")) return "BOOKING";
  return "OUTRO"; // Expedia, MMT, etc. — cobertos pelo vocabulário genérico do schema (canal: DIRETO | AIRBNB | BOOKING | OUTRO)
}

// ---- Importação pro domínio do Praxis ------------------------------------

/**
 * Aplica uma Booking Revision da Channex no schema do Praxis: resolve o
 * tenant (via property_id → ChannexPropertyMapping), resolve o tipo de UH
 * pedido (via room_type_id → ChannexRoomMapping), faz upsert de Hospede e
 * de Reserva. Idempotente — reaplicar a mesma revisão não duplica nada
 * (upsert por @@unique([tenantId, canal, canalReservaId]) em Reserva).
 */
export async function importarBookingRevision(rev: ChannexBookingRevision): Promise<void> {
  const mapping = await prisma.channexPropertyMapping.findUnique({
    where: { channexPropertyId: rev.property_id },
  });
  if (!mapping) {
    // Não é erro do hóspede nem bug — só uma property da Channex (ex.: de
    // teste, ou ainda não configurada) sem tenant mapeado no Praxis. Log e
    // sai sem lançar: um throw aqui faria a rota devolver 5xx e a Channex
    // reagendar o webhook à toa por até ~24h (ver lógica de retry na doc
    // de Webhooks).
    console.warn(`[channex] property ${rev.property_id} sem tenant mapeado — ignorando revisão ${rev.id}`);
    return;
  }
  const tenantId = mapping.tenantId;
  const canal = normalizarCanal(rev.ota_name);

  if (rev.status === "cancelled") {
    await prisma.reserva.updateMany({
      where: { tenantId, canal, canalReservaId: rev.unique_id },
      data: { status: "CANCELADA" },
    });
    return;
  }

  let uhTipoSolicitado: string | null = null;
  const roomTypeId = rev.rooms?.[0]?.room_type_id;
  if (roomTypeId) {
    const roomMapping = await prisma.channexRoomMapping.findUnique({ where: { channexRoomTypeId: roomTypeId } });
    uhTipoSolicitado = roomMapping?.uhTipo ?? null;
  }

  const nomeHospede = [rev.customer?.name, rev.customer?.surname].filter(Boolean).join(" ").trim() || "Hóspede sem nome (Channex)";

  // Dedup best-effort de Hospede por e-mail dentro do tenant — sem
  // constraint única no banco de propósito (ver comentário no schema):
  // e-mail é opcional e às vezes genérico/compartilhado pela própria OTA,
  // então preferimos duplicar hóspede a arriscar juntar pessoas erradas.
  // Refinar isto (idealmente por documento/CPF) é trabalho de fase futura.
  let hospedeId: string;
  if (rev.customer?.mail) {
    const existente = await prisma.hospede.findFirst({ where: { tenantId, email: rev.customer.mail } });
    if (existente) {
      await prisma.hospede.update({
        where: { id: existente.id },
        data: { nome: nomeHospede, telefone: rev.customer?.phone ?? undefined },
      });
      hospedeId = existente.id;
    } else {
      const criado = await prisma.hospede.create({
        data: { tenantId, nome: nomeHospede, email: rev.customer.mail, telefone: rev.customer?.phone ?? undefined },
      });
      hospedeId = criado.id;
    }
  } else {
    const criado = await prisma.hospede.create({
      data: { tenantId, nome: nomeHospede, telefone: rev.customer?.phone ?? undefined },
    });
    hospedeId = criado.id;
  }

  const valorTotal = rev.amount ? Number(rev.amount) : undefined;

  await prisma.reserva.upsert({
    where: { tenantId_canal_canalReservaId: { tenantId, canal, canalReservaId: rev.unique_id } },
    update: {
      status: "CONFIRMADA",
      checkInData: rev.arrival_date,
      checkOutData: rev.departure_date,
      uhTipoSolicitado,
      adultos: rev.occupancy?.adults ?? undefined,
      criancas: rev.occupancy?.children ?? undefined,
      valorTotal,
      moeda: rev.currency ?? undefined,
    },
    create: {
      tenantId,
      hospedeId,
      canal,
      canalReservaId: rev.unique_id,
      status: "CONFIRMADA",
      checkInData: rev.arrival_date,
      checkOutData: rev.departure_date,
      uhTipoSolicitado,
      adultos: rev.occupancy?.adults ?? 1,
      criancas: rev.occupancy?.children ?? 0,
      valorTotal,
      moeda: rev.currency ?? "BRL",
    },
  });
}

// ---- Entrada do webhook ---------------------------------------------------

export type ChannexWebhookPayload = {
  event: string;
  property_id?: string;
  payload?: { revision_id?: string; booking_id?: string };
  timestamp?: string;
};

// Eventos de reserva que nos importam nesta fase — ver lista completa em
// docs.channex.io/api-v.1-documentation/webhook-collection. Os outros
// (ari, message, review, sync_error, reservation_request...) são de fases
// futuras (Fase 2+, ou fora do escopo do PMS), ignorados de propósito.
const EVENTOS_DE_RESERVA = ["booking", "booking_new", "booking_modification", "booking_cancellation"];

/**
 * Processa um evento de webhook da Channex já autenticado (ver
 * apps/gateway/.../channel-manager/channex/webhook/route.ts, que valida o
 * header de segredo compartilhado antes de chamar isto).
 *
 * A Channex avisa na própria doc que webhooks podem chegar fora de ordem —
 * por isso o payload do evento nunca é usado direto pra decidir estado: ele
 * só dispara uma busca da revisão completa via API (buscarRevisaoPorId), e
 * é essa resposta — sempre fresca — que vira a fonte de verdade aplicada.
 */
export async function processarWebhookChannex(body: ChannexWebhookPayload): Promise<void> {
  if (!EVENTOS_DE_RESERVA.includes(body.event)) return;

  const revisionId = body.payload?.revision_id;
  if (!revisionId) return;

  const revisao = await buscarRevisaoPorId(revisionId);
  await importarBookingRevision(revisao);
  await confirmarRevisao(revisionId);
}
