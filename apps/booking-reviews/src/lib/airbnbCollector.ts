// Portado de apps/booking-reviews/src/lib/airbnbCollector.ts (v1) verbatim
// — módulo autocontido (sem Prisma, sem tenant/company), só fala com a API
// do Microsoft Graph. Precisa de MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET/
// MS_MAILBOX configurados no Vercel pra funcionar (app registration novo no
// Azure AD — nenhuma dessas credenciais existe ainda em v2).
//
// Coleta de avaliações do Airbnb via e-mail (Microsoft Graph API).
//
// As notificações do Airbnb chegam por e-mail na caixa MS_MAILBOX (Microsoft 365).
// Este módulo autentica como aplicação (client credentials — sem nenhuma pessoa
// precisando logar) e busca as mensagens cujo assunto bate com o padrão de
// notificação de avaliação, extraindo nome do hóspede e nota (já na escala 0-5).

const NAMED_RE =
  /^(?:ENC:\s*)?(.+?) deixou (?:uma|sua) avalia[cç][aã]o de (\d+) estrelas?[.!]?$/i;
const ANON_RE =
  /^(?:ENC:\s*)?Um h[oó]spede recente deixou uma avalia[cç][aã]o de (\d+) estrelas?[.!]?$/i;

export type ParsedAirbnbReview = {
  guestName: string;
  ratingRaw: number;
  guestSubmittedAt: Date;
  propertyName: string | null;
  checkInDate: Date | null;
};

export function parseAirbnbSubject(subject: string): { guestName: string; rating: number } | null {
  const s = subject.trim();
  let m = ANON_RE.exec(s);
  if (m) return { guestName: "Hóspede Airbnb", rating: parseInt(m[1], 10) };
  m = NAMED_RE.exec(s);
  if (m) return { guestName: m[1].trim(), rating: parseInt(m[2], 10) };
  return null;
}

const MONTH_ABBR: Record<string, number> = {
  jan: 0,
  fev: 1,
  mar: 2,
  abr: 3,
  mai: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  set: 8,
  out: 9,
  nov: 10,
  dez: 11,
};

// Converte o corpo do e-mail (HTML ou texto) numa lista de linhas "limpas" —
// sem isso, virar tudo uma string só torna impossível achar "nome da
// propriedade numa linha, período da estadia na linha seguinte" de forma
// confiável.
function htmlToLines(body: string): string[] {
  const withBreaks = body
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr|li)>/gi, "\n");
  const text = withBreaks
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&atilde;/gi, "ã")
    .replace(/&otilde;/gi, "õ")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&ndash;|&mdash;/gi, "–");
  return text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// Extrai nome da propriedade e data de check-in do corpo do e-mail de
// avaliação do Airbnb. O padrão do e-mail mostra o nome da propriedade numa
// linha e, logo abaixo, sozinho, o período da estadia (ex: "9 – 10 de jul.
// de 2026") — usamos o primeiro dia desse intervalo como check-in. Se o
// Airbnb mudar o layout do e-mail e o padrão não bater, simplesmente não
// preenche esses dois campos — não bloqueia a coleta do nome/nota, que
// continua vindo só do assunto.
export function parseAirbnbBody(body: string): {
  propertyName: string | null;
  checkInDate: Date | null;
} {
  const lines = htmlToLines(body);
  const dateRangeRe = /(\d{1,2})\s*[–—-]\s*\d{1,2}\s*de\s*([a-zçã]{3,4})\.?\s*de\s*(\d{4})/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = dateRangeRe.exec(line);
    if (!m) continue;
    if (line.replace(m[0], "").trim().length > 0) continue; // linha tem mais coisa além da data

    const day = parseInt(m[1], 10);
    const month = MONTH_ABBR[m[2].toLowerCase().slice(0, 3)];
    const year = parseInt(m[3], 10);
    if (month === undefined || Number.isNaN(day) || Number.isNaN(year)) continue;

    const prevLine = i > 0 ? lines[i - 1] : null;
    const propertyName =
      prevLine && prevLine.length >= 2 && prevLine.length <= 100 && !dateRangeRe.test(prevLine)
        ? prevLine
        : null;

    return { propertyName, checkInDate: new Date(year, month, day) };
  }

  return { propertyName: null, checkInDate: null };
}

async function getGraphToken(): Promise<string> {
  const tenantId = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "Integração com o Airbnb não configurada (faltam MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET)."
    );
  }

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Falha ao autenticar no Microsoft Graph: ${data.error_description ?? res.statusText}`);
  }
  return data.access_token as string;
}

type GraphMessage = {
  subject: string;
  receivedDateTime: string;
  body?: { contentType: string; content: string };
};

async function fetchReviewEmails(token: string): Promise<GraphMessage[]> {
  const mailbox = process.env.MS_MAILBOX;
  if (!mailbox) throw new Error("MS_MAILBOX não configurado.");

  const headers = { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" };
  // body vem junto pra dar pra extrair propriedade + data de check-in
  // (parseAirbnbBody) — só o assunto não tem esses dados.
  let url =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages` +
    `?$search=${encodeURIComponent('"deixou uma avaliação"')}&$select=subject,receivedDateTime,body&$top=50`;

  const messages: GraphMessage[] = [];
  while (url) {
    const res = await fetch(url, { headers });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Erro ao buscar e-mails no Graph: ${data.error?.message ?? res.statusText}`);
    }
    messages.push(...((data.value ?? []) as GraphMessage[]));
    url = data["@odata.nextLink"] ?? "";
  }
  return messages;
}

/**
 * Busca e-mails de avaliação do Airbnb recebidos depois de `since`, e retorna
 * as avaliações já parseadas (sem gravar nada no banco — isso é feito por quem
 * chama esta função, para manter a lógica de banco/transação centralizada nas
 * server actions).
 */
export async function collectNewAirbnbReviews(since: Date | null): Promise<{
  items: ParsedAirbnbReview[];
  unmatchedSubjects: string[];
  maxReceivedAt: Date | null;
}> {
  const token = await getGraphToken();
  const emails = await fetchReviewEmails(token);

  const items: ParsedAirbnbReview[] = [];
  const unmatchedSubjects: string[] = [];
  let maxReceivedAt = since;

  for (const email of emails) {
    const received = new Date(email.receivedDateTime);
    if (since && received <= since) continue;

    const parsed = parseAirbnbSubject(email.subject);
    if (!parsed) {
      unmatchedSubjects.push(email.subject);
      continue;
    }

    const { propertyName, checkInDate } = email.body?.content
      ? parseAirbnbBody(email.body.content)
      : { propertyName: null, checkInDate: null };

    items.push({
      guestName: parsed.guestName,
      ratingRaw: parsed.rating,
      guestSubmittedAt: received,
      propertyName,
      checkInDate,
    });

    if (!maxReceivedAt || received > maxReceivedAt) maxReceivedAt = received;
  }

  return { items, unmatchedSubjects, maxReceivedAt };
}
