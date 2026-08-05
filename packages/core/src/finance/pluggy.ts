/**
 * Integração com a Pluggy (pluggy.ai) — agregador de Open Finance
 * brasileiro, escolhido pra ligar o módulo Financeiro à conta corrente e
 * aos cartões de crédito reais do Felipe (Unicred Conta Corrente, Unicred
 * Visa, Cartão Carrefour, Cartão Riachuelo/Midway — cobertura confirmada em
 * docs.pluggy.ai/docs/open-finance-institutions-coverage, 05/08/2026).
 * Decisão explícita do Felipe: aposentar o Conta Azul (caro, exigia
 * importação manual de extrato) por uma conexão viva com o banco.
 *
 * Como todo integração externa desta suíte (ver channel-manager/channex.ts,
 * mesmo princípio): isolamento de fornecedor — só este arquivo (e
 * webhook/route.ts do lado do app) sabe que a Pluggy existe. Trocar de
 * agregador um dia custa reescrever isto, nada além disso.
 *
 * *** BLOQUEADO até o Felipe criar a conta em dashboard.pluggy.ai e gerar
 * Client ID + Client Secret — sem isso getClientId()/getClientSecret()
 * abaixo lançam erro claro em vez de falhar silenciosamente. ***
 *
 * Fluxo (ver docs.pluggy.ai):
 *   1. Autenticação própria (clientId+clientSecret → apiKey, ~2h de vida) —
 *      nunca as credenciais do banco do Felipe passam pelo Praxis: quem
 *      autentica com o banco é o widget Pluggy Connect, no navegador dele.
 *   2. Front-end pede um `connectToken` pra este backend (ver
 *      criarConnectToken) e abre o widget Pluggy Connect com ele.
 *   3. O Felipe autoriza o banco/cartão no widget; a Pluggy devolve um
 *      `itemId` — persistimos em FinanceContaConectada.
 *   4. Varredura diária (requisito 6 da spec): pra cada FinanceContaBancaria
 *      já conectada, buscar transações novas (buscarTransacoesNovas) e
 *      materializar como FinanceLancamento com origem=PLUGGY,
 *      categoriaId=null (pendente de categorização — dispara os alertas de
 *      alertas.ts).
 */

import { prisma } from "../prisma";
import { somarMeses, limitesDoMes } from "./dre";

const PLUGGY_BASE_URL = "https://api.pluggy.ai";

function getClientId(): string {
  const id = process.env.PLUGGY_CLIENT_ID;
  if (!id) {
    throw new Error(
      "PLUGGY_CLIENT_ID não configurado. Crie uma conta em dashboard.pluggy.ai, gere Client ID + Client Secret e defina nas env vars deste app."
    );
  }
  return id;
}

function getClientSecret(): string {
  const secret = process.env.PLUGGY_CLIENT_SECRET;
  if (!secret) {
    throw new Error(
      "PLUGGY_CLIENT_SECRET não configurado. Crie uma conta em dashboard.pluggy.ai, gere Client ID + Client Secret e defina nas env vars deste app."
    );
  }
  return secret;
}

// A apiKey da Pluggy expira (~2h) — cache em memória do processo, simples
// e suficiente pro volume desta suíte (1 tenant usando o módulo por
// enquanto). Se expirar no meio de uma execução, o próximo pluggyFetch
// pega 401 e re-autentica sozinho (ver pluggyFetch).
let apiKeyCache: { key: string; obtidoEm: number } | null = null;
const API_KEY_TTL_MS = 100 * 60 * 1000; // 100min — margem sobre o ~2h real

async function getApiKey(): Promise<string> {
  if (apiKeyCache && Date.now() - apiKeyCache.obtidoEm < API_KEY_TTL_MS) {
    return apiKeyCache.key;
  }
  const res = await fetch(`${PLUGGY_BASE_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: getClientId(), clientSecret: getClientSecret() }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Pluggy /auth ${res.status}: ${body}`);
  }
  const data = (await res.json()) as { apiKey: string };
  apiKeyCache = { key: data.apiKey, obtidoEm: Date.now() };
  return data.apiKey;
}

async function pluggyFetch<T>(path: string, init?: RequestInit, tentouReautenticar = false): Promise<T> {
  const apiKey = await getApiKey();
  const res = await fetch(`${PLUGGY_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (res.status === 401 && !tentouReautenticar) {
    apiKeyCache = null; // força nova autenticação
    return pluggyFetch<T>(path, init, true);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Pluggy API ${res.status} em ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ---- Connect Token (pro widget Pluggy Connect no front-end) --------------

/**
 * Gera um connectToken de uso único pro widget Pluggy Connect. `itemId`
 * opcional: passar quando for RE-autorizar uma conexão existente (status
 * LOGIN_ERROR/OUTDATED), em vez de criar uma nova do zero.
 */
export async function criarConnectToken(itemId?: string): Promise<string> {
  const body = itemId ? { itemId } : {};
  const data = await pluggyFetch<{ accessToken: string }>("/connect_token", { method: "POST", body: JSON.stringify(body) });
  return data.accessToken;
}

// ---- Item (conexão com uma instituição) -----------------------------------

export type PluggyItem = {
  id: string;
  connector: { id: number; name: string };
  status: "LOGIN_IN_PROGRESS" | "UPDATING" | "UPDATED" | "LOGIN_ERROR" | "OUTDATED" | "WAITING_USER_INPUT";
  executionStatus: string;
  lastUpdatedAt: string | null;
};

export async function buscarItem(itemId: string): Promise<PluggyItem> {
  return pluggyFetch<PluggyItem>(`/items/${itemId}`);
}

// ---- Contas (bancárias/cartão) dentro de um Item --------------------------

export type PluggyAccount = {
  id: string;
  itemId: string;
  type: "BANK" | "CREDIT";
  name: string;
  balance: number;
  creditData?: { creditLimit?: number };
};

export async function listarContas(itemId: string): Promise<PluggyAccount[]> {
  const data = await pluggyFetch<{ results: PluggyAccount[] }>(`/accounts?itemId=${itemId}`);
  return data.results;
}

// ---- Transações -------------------------------------------------------------

export type PluggyTransaction = {
  id: string;
  accountId: string;
  description: string;
  amount: number; // negativo = saída, positivo = entrada (mesma convenção que já usamos em FinanceLancamento.valor)
  date: string; // ISO — vira dataVencimento (YYYY-MM-DD) na hora de gravar
  category?: string; // categorização automática da própria Pluggy — usada só como sugestão, nunca grava direto (categorização final é sempre humana, ver requisito 6)
  merchant?: { name?: string };
};

/** Busca transações de uma conta, opcionalmente só a partir de uma data
 * (YYYY-MM-DD), usado na varredura diária pra não reprocessar o histórico
 * inteiro toda vez.
 *
 * `/transactions` (v1, por página) foi desativado pela Pluggy — descoberto
 * em produção (05/08/2026): "410 ENDPOINT_DEPRECATED — Use GET
 * /v2/transactions with cursor pagination instead". `/v2/transactions` usa
 * paginação por cursor (`after`, vindo do campo `next` da resposta
 * anterior) em vez de página numerada — por isso o loop abaixo, seguindo a
 * própria recomendação da doc de paginar o máximo por chamada (500) e
 * repetir enquanto houver `next`. */
export async function listarTransacoes(accountId: string, desde?: string): Promise<PluggyTransaction[]> {
  const todas: PluggyTransaction[] = [];

  const queryInicial = new URLSearchParams({ accountId });
  if (desde) queryInicial.set("dateFrom", desde);

  // `next` já vem pronto como "?accountId=...&after=..." (a query string
  // inteira da próxima página, não um valor de cursor isolado) — usar
  // direto, sem reembrulhar num novo URLSearchParams (foi exatamente esse
  // erro que causou "400 INVALID_CURSOR" em produção, 05/08/2026: o cursor
  // acabava com a query string inteira dentro dele, dupla-codificada).
  let proximaQuery: string | null = `?${queryInicial.toString()}`;

  while (proximaQuery) {
    const data: { results: PluggyTransaction[]; next: string | null } = await pluggyFetch(`/v2/transactions${proximaQuery}`);
    todas.push(...data.results);
    proximaQuery = data.next;
  }

  return todas;
}

// ---- Vencimento de fatura de cartão ----------------------------------------

/**
 * Data de vencimento da FATURA em que uma compra de cartão cai (pedido do
 * Felipe, 05/08/2026: "o vencimento será sempre o vencimento da fatura",
 * não a data da compra). Usa o ciclo real do cartão — dia de FECHAMENTO +
 * dia de VENCIMENTO, ambos configurados em Configurações > Cartões de
 * Crédito (pedido do Felipe, 05/08/2026, 2ª rodada — a versão anterior só
 * tinha o dia de vencimento e assumia "sempre mês seguinte", o que juntava
 * datas de fechamento reais que variam por cartão).
 *
 * Regra, com exemplo do Felipe (fechamento=1, vencimento=10):
 *   1. Acha o MÊS DE FECHAMENTO da compra: se o dia da compra é <= dia de
 *      fechamento, fecha no mesmo mês da compra; senão, rola pro fechamento
 *      do mês seguinte. Ex.: compra em 1/ago (dia 1 <= 1) fecha em agosto;
 *      compra em 2/jul (dia 2 > 1) fecha em agosto também (rolou).
 *   2. A partir do mês de fechamento, o VENCIMENTO cai no mesmo mês se
 *      diaVencimento >= diaFechamento (ex.: fecha dia 1, vence dia 10 — os
 *      dois em agosto); senão, no mês seguinte ao fechamento (ex.: fecha dia
 *      25, vence dia 5 — fechamento em agosto, vencimento em setembro).
 *
 * Sem diaFechamentoFatura configurado (cartão legado, cadastro antigo),
 * cai no fallback de antes: sempre mês seguinte à compra, no dia de
 * vencimento.
 */
export function calcularVencimentoFatura(dataCompraISO: string, diaVencimentoFatura: number, diaFechamentoFatura?: number | null): string {
  if (!diaFechamentoFatura) {
    const proximoMes = somarMeses(dataCompraISO, 1).slice(0, 7); // YYYY-MM
    const { ultimoDia } = limitesDoMes(proximoMes);
    const dia = Math.min(diaVencimentoFatura, ultimoDia);
    return `${proximoMes}-${String(dia).padStart(2, "0")}`;
  }

  const [anoStr, mesStr, diaStr] = dataCompraISO.split("-");
  const diaCompra = Number(diaStr);

  // Mês de fechamento da fatura que engloba essa compra.
  let mesFechamento = `${anoStr}-${mesStr}`;
  if (diaCompra > diaFechamentoFatura) mesFechamento = somarMeses(mesFechamento + "-01", 1).slice(0, 7);

  // Mês de vencimento a partir do mês de fechamento.
  let mesVencimento = mesFechamento;
  if (diaVencimentoFatura < diaFechamentoFatura) mesVencimento = somarMeses(mesFechamento + "-01", 1).slice(0, 7);

  const { ultimoDia } = limitesDoMes(mesVencimento);
  const dia = Math.min(diaVencimentoFatura, ultimoDia);
  return `${mesVencimento}-${String(dia).padStart(2, "0")}`;
}

// ---- Detecção de pagamento de fatura ---------------------------------------

/**
 * Depois que a conta corrente sincroniza, tenta identificar se algum
 * lançamento novo é o pagamento da fatura de um cartão — e se for, marca
 * TODOS os lançamentos daquela fatura (mesma contaBancariaId + mesma
 * dataVencimento, que já é a data de vencimento da fatura) como pago=true
 * (requisito do Felipe, 05/08/2026: "o sistema tem que identificar quando o
 * cartão for pago através de um lançamento da própria conta corrente").
 *
 * Heurística (não é garantida — é a melhor aproximação sem um identificador
 * oficial de "isto é um pagamento de fatura" na Pluggy): débito na conta
 * corrente cuja descrição menciona "fatura"/"cartão" ou o nome do próprio
 * cartão, casado com a fatura em aberto mais recente daquele cartão. Se
 * errar, o Felipe pode desmarcar/marcar `pago` na mão em Lançamentos.
 */
async function detectarPagamentosDeFatura(tenantId: string, pagamentosCandidatos: { id: string; descricao: string; valor: unknown; dataVencimento: string }[]): Promise<void> {
  if (pagamentosCandidatos.length === 0) return;

  const cartoes = await prisma.financeContaBancaria.findMany({ where: { tenantId, tipo: "CREDIT" } });
  if (cartoes.length === 0) return;

  for (const pagamento of pagamentosCandidatos) {
    if (Number(pagamento.valor) >= 0) continue; // só débito (saída de dinheiro) pode ser pagamento de fatura
    const descricaoUpper = pagamento.descricao.toUpperCase();

    for (const cartao of cartoes) {
      const pareceComPagamentoDeFatura =
        descricaoUpper.includes("FATURA") || descricaoUpper.includes("CARTAO") || descricaoUpper.includes("CARTÃO") || descricaoUpper.includes(cartao.nome.toUpperCase());
      if (!pareceComPagamentoDeFatura) continue;

      // Fatura em aberto mais recente daquele cartão, com vencimento até a
      // data do pagamento (não faz sentido quitar uma fatura que ainda nem
      // venceu).
      const faturaEmAberto = await prisma.financeLancamento.findFirst({
        where: { tenantId, contaBancariaId: cartao.id, pago: false, dataVencimento: { lte: pagamento.dataVencimento } },
        orderBy: { dataVencimento: "desc" },
        select: { dataVencimento: true },
      });
      if (!faturaEmAberto) continue;

      await prisma.financeLancamento.updateMany({
        where: { tenantId, contaBancariaId: cartao.id, pago: false, dataVencimento: faturaEmAberto.dataVencimento },
        data: { pago: true, pagoReferenciaLancamentoId: pagamento.id },
      });
    }
  }
}

// ---- Varredura diária → FinanceLancamento ----------------------------------

/**
 * Varredura diária (requisito 6): busca transações novas de TODAS as
 * FinanceContaBancaria já conectadas de um tenant e materializa como
 * FinanceLancamento com origem=PLUGGY e categoriaId=null (pendente —
 * dispara o alerta de categorização em alertas.ts). Idempotente via
 * pluggyTransactionId @unique: reprocessar não duplica.
 *
 * Quem chama isto é o cron diário do app (ver
 * apps/financeiro/src/app/api/cron/sync-pluggy/route.ts) — não é chamado
 * na hora do Connect (a 1ª carga de cada conta nova roda por esta mesma
 * função, só que sem filtro `desde`, no dia seguinte ao connect).
 */
export async function sincronizarContasDoTenant(tenantId: string): Promise<{ novos: number }> {
  const contas = await prisma.financeContaBancaria.findMany({
    where: { tenantId },
    include: { contaConectada: true },
  });

  let novos = 0;
  const candidatosPagamentoFatura: { id: string; descricao: string; valor: unknown; dataVencimento: string }[] = [];

  for (const conta of contas) {
    // Marca d'água do que já foi sincronizado: usa o horário da ÚLTIMA
    // sincronização da conexão (não o MAX(dataVencimento) dos lançamentos
    // já gravados) — importante pra cartão de crédito, cuja dataVencimento
    // agora é a data da FATURA (normalmente no futuro em relação à compra em
    // si); usar dataVencimento como referência faria o sync pular
    // transações novas reais. 3 dias de folga cobrem fuso/atraso de
    // processamento; reprocessar não duplica (pluggyTransactionId @unique).
    const desde = conta.contaConectada.ultimaSincronizacaoEm
      ? new Date(conta.contaConectada.ultimaSincronizacaoEm.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : undefined;

    const transacoes = await listarTransacoes(conta.pluggyAccountId, desde);

    for (const t of transacoes) {
      const dataVencimento =
        conta.tipo === "CREDIT" && conta.diaVencimentoFatura
          ? calcularVencimentoFatura(t.date.slice(0, 10), conta.diaVencimentoFatura, conta.diaFechamentoFatura)
          : t.date.slice(0, 10);

      // Lançamento de conta corrente (BANK) já é sempre "quitado" por
      // definição (regra do Felipe — dinheiro que já saiu de fato); cartão
      // depende da detecção de pagamento de fatura abaixo.
      const pago = conta.tipo === "BANK";

      try {
        const criado = await prisma.financeLancamento.create({
          data: {
            tenantId,
            categoriaId: null, // sempre pendente — categorização é sempre humana (requisito 6)
            descricao: t.description,
            fornecedor: t.merchant?.name ?? null,
            valor: t.amount,
            dataVencimento,
            origem: "PLUGGY",
            contaBancariaId: conta.id,
            pluggyTransactionId: t.id,
            pago,
          },
        });
        novos++;
        if (conta.tipo === "BANK") {
          candidatosPagamentoFatura.push({ id: criado.id, descricao: criado.descricao, valor: criado.valor, dataVencimento: criado.dataVencimento });
        }
      } catch (e: any) {
        // P2002 = unique constraint (pluggyTransactionId já existe) — é o
        // caso esperado de reprocessar um período que já tinha sido
        // sincronizado antes; qualquer outro erro é propagado.
        if (e?.code !== "P2002") throw e;
      }
    }

    await prisma.financeContaConectada.update({
      where: { id: conta.contaConectadaId },
      data: { ultimaSincronizacaoEm: new Date() },
    });
  }

  await detectarPagamentosDeFatura(tenantId, candidatosPagamentoFatura);

  return { novos };
}
