"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma, getSession, hasModuleAccess } from "@praxis/core";
import { runChatTurn } from "@praxis/ai-engine";

// Ações do chat da Central de Inteligência. Sem estado client-side, mesmo
// padrão do resto do gateway: cada turno é uma submissão de form que faz um
// round-trip completo pelo servidor (grava a mensagem do usuário, roda
// runChatTurn — que pode chamar ferramentas de leitura real, ver
// @praxis/ai-engine/chat — grava a resposta, recarrega a página). Não há
// streaming: mesma limitação/honestidade já assumida pro resto do AI
// Engine (hospedagem 100% serverless).

async function requireAccess() {
  const session = await getSession();
  if (!session) throw new Error("Não autenticado.");
  const pode = await hasModuleAccess(session, "INTELLIGENCE");
  if (!pode) throw new Error("Sem acesso à Central de Inteligência.");
  return session;
}

export async function iniciarConversaAction(tenantSlug: string, formData: FormData) {
  const session = await requireAccess();
  const mensagem = String(formData.get("mensagem") ?? "").trim();
  if (!mensagem) return;

  const conversa = await prisma.aiConversation.create({
    data: {
      tenantId: session.tenantId,
      userId: session.userId,
      title: mensagem.length > 60 ? `${mensagem.slice(0, 57)}...` : mensagem,
    },
  });

  await prisma.aiMessage.create({
    data: { conversationId: conversa.id, role: "USER", content: mensagem },
  });

  const resultado = await runChatTurn({
    tenantId: session.tenantId,
    userId: session.userId,
    historico: [],
    novaMensagem: mensagem,
  });

  await prisma.aiMessage.create({
    data: {
      conversationId: conversa.id,
      role: "ASSISTANT",
      content: resultado.resposta,
      toolCalls: JSON.stringify(resultado.toolCalls),
    },
  });

  revalidatePath(`/${tenantSlug}/inteligencia/chat`);
  redirect(`/${tenantSlug}/inteligencia/chat/${conversa.id}`);
}

export async function enviarMensagemAction(tenantSlug: string, conversationId: string, formData: FormData) {
  const session = await requireAccess();
  const conversa = await prisma.aiConversation.findUnique({ where: { id: conversationId } });
  if (!conversa || conversa.tenantId !== session.tenantId || conversa.userId !== session.userId) {
    throw new Error("Conversa não encontrada.");
  }

  const mensagem = String(formData.get("mensagem") ?? "").trim();
  if (!mensagem) return;

  const historicoBruto = await prisma.aiMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });
  const historico = historicoBruto.map((m) => ({
    role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
    content: m.content,
  }));

  await prisma.aiMessage.create({
    data: { conversationId, role: "USER", content: mensagem },
  });

  const resultado = await runChatTurn({
    tenantId: session.tenantId,
    userId: session.userId,
    historico,
    novaMensagem: mensagem,
  });

  await prisma.aiMessage.create({
    data: {
      conversationId,
      role: "ASSISTANT",
      content: resultado.resposta,
      toolCalls: JSON.stringify(resultado.toolCalls),
    },
  });

  await prisma.aiConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

  revalidatePath(`/${tenantSlug}/inteligencia/chat/${conversationId}`);
}
