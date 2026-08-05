import { NextRequest, NextResponse } from "next/server";
import { prisma, buscarItem, sincronizarContasDoTenant } from "@praxis/core";

// Webhook da Pluggy — cadastrar em dashboard.pluggy.ai (Settings > Webhooks,
// ou no passo "Registre webhooks para eventos-chave" do checklist de acesso
// à produção) apontando pra:
//
//   https://sistemapraxis-financeiro.vercel.app/financeiro/api/webhooks/pluggy?secret=<PLUGGY_WEBHOOK_SECRET>
//
// (a Pluggy exige HTTPS não-localhost — a URL de deploy da Vercel já serve;
// não precisa passar pelo gateway, esta rota não depende de sessão de
// usuário). Evento: "all" (mais simples que listar os 5 obrigatórios um a
// um — os que não tratamos aqui só são ignorados, sem custo).
//
// Autenticação: segredo compartilhado na própria URL, não em header — a
// doc da Pluggy avisa que headers customizados só dá pra configurar via
// API, e o formulário do dashboard só pede a URL. Mesmo raciocínio do
// CHANNEX_WEBHOOK_SECRET (ver apps/gateway/.../channex/webhook/route.ts),
// só que como query param em vez de header por essa limitação do form.
//
// Pra cada evento, seguimos a recomendação da própria Pluggy: nunca confiar
// direto no payload do evento pra dado sensível — sempre buscar o estado
// fresco via GET (buscarItem) antes de gravar. Responde 200 rápido mesmo
// em caso de erro de processamento (loga e segue) — mesma lógica do
// webhook da Channex: um erro nosso não deveria fazer a Pluggy reagendar o
// mesmo evento por até ~2h (ver política de retry na doc de Webhooks).
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!process.env.PLUGGY_WEBHOOK_SECRET || secret !== process.env.PLUGGY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const evento = body?.event as string | undefined;
  const itemId = body?.itemId as string | undefined;

  try {
    if (itemId && (evento?.startsWith("item/") || evento === "connector/status_updated")) {
      const contaConectada = await prisma.financeContaConectada.findUnique({ where: { pluggyItemId: itemId } });
      if (contaConectada) {
        const item = await buscarItem(itemId);
        await prisma.financeContaConectada.update({
          where: { id: contaConectada.id },
          data: {
            status: item.status,
            erro: item.status === "LOGIN_ERROR" || item.status === "OUTDATED" ? evento : null,
            ...(item.status === "UPDATED" ? { ultimaSincronizacaoEm: new Date() } : {}),
          },
        });
      }
    }

    if (itemId && evento?.startsWith("transactions/")) {
      const contaConectada = await prisma.financeContaConectada.findUnique({ where: { pluggyItemId: itemId } });
      if (contaConectada) {
        // Reaproveita a mesma varredura do cron diário (ver pluggy.ts) —
        // idempotente via pluggyTransactionId @unique, então rodar de novo
        // pelo webhook não duplica nada mesmo se o cron já tiver passado
        // por essa conta no mesmo dia.
        await sincronizarContasDoTenant(contaConectada.tenantId);
      }
    }
  } catch (err) {
    console.error("[pluggy-webhook] erro ao processar evento", evento, err);
  }

  return NextResponse.json({ received: true });
}
