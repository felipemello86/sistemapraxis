import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@praxis/core";
import { encontrarOuCriarLeadPorTelefone } from "../../../admin/crm/data";

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

      // Mensagens recebidas.
      for (const msg of value.messages ?? []) {
        const telefoneDigits = msg.from;
        const nomeContato = value.contacts?.[0]?.profile?.name;
        const { conteudo, tipo } = extrairConteudo(msg);

        const lead = await encontrarOuCriarLeadPorTelefone(telefoneDigits, nomeContato);

        // upsert por waMessageId — a Meta reentrega o mesmo webhook mais de
        // uma vez (at-least-once), sem isso duplicaria a mensagem no chat.
        await prisma.whatsAppMensagem.upsert({
          where: { waMessageId: msg.id },
          create: {
            leadId: lead.id,
            direcao: "RECEBIDA",
            conteudo,
            tipo,
            waMessageId: msg.id,
            status: "ENTREGUE",
          },
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

        await prisma.whatsAppMensagem
          .update({ where: { waMessageId: status.id }, data: { status: novoStatus } })
          .catch(() => {
            // Mensagem não encontrada (ex: enviada antes desta feature existir) — ignora.
          });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
