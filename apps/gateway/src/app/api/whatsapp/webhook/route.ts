import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@praxis/core";
import { encontrarOuCriarLeadPorTelefone } from "../../../admin/crm/data";
import { encontrarOuCriarVendasLeadPorTelefone } from "../../../[cliente]/vendas/data";

export const runtime = "nodejs";

// CRM Fase 2 (30/07/2026) — webhook da WhatsApp Cloud API (Meta). Duas
// responsabilidades bem separadas:
//   GET  — "handshake" de verificação que a Meta faz UMA vez, quando você
//          salva a URL do webhook no painel do app. Só confirma que
//          hub.verify_token bate com WHATSAPP_VERIFY_TOKEN (valor que você
//          escolhe e cola nos dois lugares) e devolve hub.challenge.
//   POST — chamado pela Meta a cada evento novo (mensagem recebida, ou
//          atualização de status de uma mensagem que a gente mandou).
//
// Sem autenticação por sessão de admin (não faz sentido — quem chama é a
// Meta, não um humano logado): a "senha" daqui é o verify_token do GET e,
// implicitamente, o fato da URL não ser adivinhável.

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verificação falhou." }, { status: 403 });
}

// Formato do payload documentado em developers.facebook.com/docs/whatsapp/
// cloud-api/webhooks/payload-examples — resumido aqui só com os campos que
// de fato usamos.
type WhatsAppMensagemRecebida = {
  from: string; // dígitos com DDI, sem "+" (ex: "5581989526361")
  id: string; // wamid.XXX
  type: string; // "text" | "image" | "audio" | "document" | "video" | "sticker" | ...
  text?: { body: string };
};

type WhatsAppStatusUpdate = {
  id: string; // wamid.XXX da mensagem que NÓS mandamos
  status: string; // "sent" | "delivered" | "read" | "failed"
};

type WhatsAppWebhookBody = {
  entry?: {
    changes?: {
      value?: {
        contacts?: { profile?: { name?: string } }[];
        messages?: WhatsAppMensagemRecebida[];
        statuses?: WhatsAppStatusUpdate[];
        // Identifica DE QUAL número esse evento é — presente em todo
        // evento de verdade da Cloud API. É o campo que usamos (06/08/2026)
        // pra decidir se o evento é do número único do CRM do admin (env
        // var WHATSAPP_PHONE_NUMBER_ID) ou de um número conectado por um
        // tenant via Embedded Signup (ChannelConnection.phoneNumberId) —
        // um webhook só, pra todos os números, sempre foi assim (ver
        // comentário original acima sobre "não existe webhook por tenant").
        metadata?: { phone_number_id?: string };
      };
    }[];
  }[];
};

// Mensagens de mídia (imagem, áudio, documento etc.) não têm o conteúdo
// baixado ainda nesta 1ª versão — a Cloud API só devolve um media_id que
// exige uma 2ª chamada autenticada pra pegar a URL (que expira rápido) e
// depois um re-upload pra um storage permanente (Cloudinary, como o resto
// da suíte já faz com fotos). Fica registrado como atividade textual pra
// não perder o aviso "chegou uma mídia", mesmo sem mostrar o conteúdo ainda.
function extrairConteudo(msg: WhatsAppMensagemRecebida): { conteudo: string; tipo: string } {
  if (msg.type === "text" && msg.text?.body) {
    return { conteudo: msg.text.body, tipo: "texto" };
  }
  return { conteudo: `[Mensagem do tipo "${msg.type}" recebida — visualização ainda não suportada]`, tipo: msg.type };
}

export async function POST(req: NextRequest) {
  let body: WhatsAppWebhookBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // corpo inválido — ainda assim 200, Meta reenviaria à toa
  }

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      const phoneNumberId = value.metadata?.phone_number_id;
      // Número único do CRM do admin (venda da Praxis pra hotéis) — fluxo
      // original, intocado. Qualquer OUTRO phone_number_id é de um tenant
      // que conectou via Embedded Signup (ver ChannelConnection).
      const ehNumeroDoAdmin = phoneNumberId && phoneNumberId === process.env.WHATSAPP_PHONE_NUMBER_ID;
      const tenantId = ehNumeroDoAdmin || !phoneNumberId
        ? null
        : (await prisma.channelConnection.findUnique({ where: { phoneNumberId }, select: { tenantId: true } }))?.tenantId ?? null;

      // Mensagens recebidas.
      for (const msg of value.messages ?? []) {
        const telefoneDigits = msg.from;
        const nomeContato = value.contacts?.[0]?.profile?.name;
        const { conteudo, tipo } = extrairConteudo(msg);

        if (ehNumeroDoAdmin) {
          const lead = await encontrarOuCriarLeadPorTelefone(telefoneDigits, nomeContato);
          await prisma.whatsAppMensagem.upsert({
            where: { waMessageId: msg.id },
            create: { leadId: lead.id, direcao: "RECEBIDA", conteudo, tipo, waMessageId: msg.id, status: "ENTREGUE" },
            update: {},
          });
          await prisma.leadActivity.create({
            data: {
              leadId: lead.id,
              tipo: "MENSAGEM",
              conteudo: tipo === "texto" ? conteudo : `Recebeu uma mensagem de WhatsApp (${tipo}).`,
              autorNome: nomeContato || "Contato (WhatsApp)",
            },
          });
        } else if (tenantId) {
          const lead = await encontrarOuCriarVendasLeadPorTelefone(tenantId, telefoneDigits, nomeContato);
          // upsert por waMessageId — a Meta reentrega o mesmo webhook mais
          // de uma vez (at-least-once), sem isso duplicaria a mensagem.
          await prisma.vendasMensagem.upsert({
            where: { waMessageId: msg.id },
            create: { leadId: lead.id, direcao: "RECEBIDA", conteudo, tipo, waMessageId: msg.id, status: "ENTREGUE" },
            update: {},
          });
          await prisma.vendasAtividade.create({
            data: {
              leadId: lead.id,
              tipo: "MENSAGEM",
              conteudo: tipo === "texto" ? conteudo : `Recebeu uma mensagem de WhatsApp (${tipo}).`,
              autorNome: nomeContato || "Contato (WhatsApp)",
            },
          });
        }
        // Nem admin nem tenant reconhecido: número desconhecido pra nós
        // (ex: conexão removida depois do evento já ter sido enfileirado
        // do lado da Meta) — ignora silenciosamente, sem erro.
      }

      // Atualizações de status de mensagens que NÓS mandamos.
      for (const status of value.statuses ?? []) {
        const novoStatus =
          status.status === "delivered"
            ? "ENTREGUE"
            : status.status === "read"
              ? "LIDA"
              : status.status === "failed"
                ? "FALHOU"
                : null;
        if (!novoStatus) continue;

        if (ehNumeroDoAdmin) {
          await prisma.whatsAppMensagem.update({ where: { waMessageId: status.id }, data: { status: novoStatus } }).catch(() => {});
        } else if (tenantId) {
          await prisma.vendasMensagem.update({ where: { waMessageId: status.id }, data: { status: novoStatus } }).catch(() => {});
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
