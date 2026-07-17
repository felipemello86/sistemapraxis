"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@praxis/core";
import { requireRole, requireSession } from "@/lib/auth";
import { uploadToCloudinary, deleteFromCloudinary } from "@/lib/cloudinary";
import { safeAction } from "@/lib/safeAction";

// Portado de apps/booking-reviews/src/app/(app)/reunioes/actions.ts (v1).
// companyId→tenantId; session.name→session.nome; user.name→user.nome. Mesma
// troca de padrão de todo o resto do módulo v2: cada action real (Impl) fica
// crua com throw normal, e um export fino embrulha em safeAction (ver
// src/lib/safeAction.ts) — o v1 chamava essas actions direto do cliente sem
// esse embrulho, o que quebra em produção porque o Next.js apaga a mensagem
// de erro lançada através da fronteira de uma Server Action.

const MAX_ATTACHMENT_BYTES = 4.5 * 1024 * 1024; // limite de body do Vercel (Hobby) pra Server Actions

async function assertMeetingInTenant(meetingId: string, tenantId: string) {
  const meeting = await prisma.performanceMeeting.findFirstOrThrow({
    where: { id: meetingId, tenantId },
  });
  return meeting;
}

export type SaveMeetingInput = {
  meetingId?: string; // se vier, é edição; se não, cria nova
  date: string; // YYYY-MM-DD
  coordinatorId: string;
  participantIds: string[];
};

// Cria ou edita uma reunião (data, coordenador, participantes). Restrito a
// Master/Gerente. Loga no histórico as mudanças de coordenador/participantes.
async function saveMeetingActionImpl(input: SaveMeetingInput): Promise<string> {
  const session = await requireRole("GERENTE", "MASTER");

  if (!input.date) throw new Error("Informe a data da reunião.");
  if (!input.coordinatorId) throw new Error("Selecione o coordenador.");

  const coordinator = await prisma.user.findFirstOrThrow({
    where: { id: input.coordinatorId, tenantId: session.tenantId },
  });

  const validParticipants = await prisma.user.findMany({
    where: { id: { in: input.participantIds }, tenantId: session.tenantId },
    select: { id: true },
  });
  const participantIds = validParticipants.map((u) => u.id);

  if (!input.meetingId) {
    const meeting = await prisma.performanceMeeting.create({
      data: {
        tenantId: session.tenantId,
        date: new Date(input.date),
        coordinatorId: coordinator.id,
        createdById: session.userId,
        participants: { create: participantIds.map((userId) => ({ userId })) },
        logs: {
          create: {
            actorId: session.userId,
            action: "CRIADA",
            detail: `Reunião agendada para ${new Date(input.date).toLocaleDateString("pt-BR")}, coordenada por ${coordinator.nome}.`,
          },
        },
      },
    });
    revalidatePath("/reunioes");
    return meeting.id;
  }

  const meeting = await assertMeetingInTenant(input.meetingId, session.tenantId);
  const currentParticipants = await prisma.performanceMeetingParticipant.findMany({
    where: { meetingId: meeting.id },
    select: { userId: true, user: { select: { nome: true } } },
  });
  const currentIds = new Set(currentParticipants.map((p) => p.userId));
  const nextIds = new Set(participantIds);
  const added = participantIds.filter((id) => !currentIds.has(id));
  const removed = currentParticipants.filter((p) => !nextIds.has(p.userId));

  const logEntries: { actorId: string; action: string; detail: string }[] = [];
  if (meeting.coordinatorId !== coordinator.id) {
    logEntries.push({
      actorId: session.userId,
      action: "COORDENADOR_ALTERADO",
      detail: `Coordenador alterado para ${coordinator.nome}.`,
    });
  }
  if (meeting.date.toISOString().slice(0, 10) !== input.date) {
    logEntries.push({
      actorId: session.userId,
      action: "DATA_ALTERADA",
      detail: `Data alterada para ${new Date(input.date).toLocaleDateString("pt-BR")}.`,
    });
  }
  if (added.length > 0 || removed.length > 0) {
    const addedNames = await prisma.user.findMany({
      where: { id: { in: added } },
      select: { nome: true },
    });
    const parts: string[] = [];
    if (addedNames.length > 0) parts.push(`adicionados: ${addedNames.map((u) => u.nome).join(", ")}`);
    if (removed.length > 0) parts.push(`removidos: ${removed.map((p) => p.user.nome).join(", ")}`);
    logEntries.push({
      actorId: session.userId,
      action: "PARTICIPANTES_ATUALIZADOS",
      detail: parts.join(" · "),
    });
  }

  await prisma.$transaction([
    prisma.performanceMeeting.update({
      where: { id: meeting.id },
      data: { date: new Date(input.date), coordinatorId: coordinator.id },
    }),
    prisma.performanceMeetingParticipant.deleteMany({ where: { meetingId: meeting.id } }),
    prisma.performanceMeetingParticipant.createMany({
      data: participantIds.map((userId) => ({ meetingId: meeting.id, userId })),
    }),
    ...(logEntries.length > 0
      ? [
          prisma.performanceMeetingLog.createMany({
            data: logEntries.map((l) => ({ ...l, meetingId: meeting.id })),
          }),
        ]
      : []),
  ]);

  revalidatePath("/reunioes");
  return meeting.id;
}

// Exclusão definitiva (cascata: participantes, observações, anexos e log).
// Anexos no Cloudinary são removidos antes, senão ficam órfãos lá.
async function deleteMeetingActionImpl(meetingId: string) {
  const session = await requireRole("GERENTE", "MASTER");
  const meeting = await assertMeetingInTenant(meetingId, session.tenantId);

  const attachments = await prisma.performanceMeetingAttachment.findMany({
    where: { meetingId: meeting.id },
    select: { fileUrl: true },
  });
  await Promise.all(attachments.map((a) => deleteFromCloudinary(a.fileUrl)));

  await prisma.performanceMeeting.delete({ where: { id: meeting.id } });
  revalidatePath("/reunioes");
}

// Observações: qualquer usuário autenticado pode adicionar. Só quem
// escreveu pode editar; quem escreveu ou Master/Gerente pode excluir — mesmo
// padrão das observações gerenciais do Kanban.
async function addMeetingNoteActionImpl(meetingId: string, text: string) {
  const session = await requireSession();
  const trimmed = text?.trim();
  if (!trimmed) throw new Error("Escreva algo antes de salvar a observação.");

  const meeting = await assertMeetingInTenant(meetingId, session.tenantId);

  await prisma.$transaction([
    prisma.performanceMeetingNote.create({
      data: { meetingId: meeting.id, authorId: session.userId, text: trimmed },
    }),
    prisma.performanceMeetingLog.create({
      data: { meetingId: meeting.id, actorId: session.userId, action: "OBSERVACAO_ADICIONADA" },
    }),
  ]);

  revalidatePath("/reunioes");
}

async function updateMeetingNoteActionImpl(noteId: string, text: string) {
  const session = await requireSession();
  const trimmed = text?.trim();
  if (!trimmed) throw new Error("Escreva algo antes de salvar a observação.");

  const note = await prisma.performanceMeetingNote.findFirstOrThrow({
    where: { id: noteId },
    include: { meeting: true },
  });
  if (note.meeting.tenantId !== session.tenantId) throw new Error("FORBIDDEN");
  if (note.authorId !== session.userId) {
    throw new Error("Só quem escreveu a observação pode editá-la.");
  }

  await prisma.performanceMeetingNote.update({ where: { id: noteId }, data: { text: trimmed } });
  revalidatePath("/reunioes");
}

async function deleteMeetingNoteActionImpl(noteId: string) {
  const session = await requireSession();
  const note = await prisma.performanceMeetingNote.findFirstOrThrow({
    where: { id: noteId },
    include: { meeting: true },
  });
  if (note.meeting.tenantId !== session.tenantId) throw new Error("FORBIDDEN");

  const canDelete =
    note.authorId === session.userId || session.role === "MASTER" || session.role === "GERENTE";
  if (!canDelete) throw new Error("Você não tem permissão para excluir esta observação.");

  await prisma.performanceMeetingNote.delete({ where: { id: noteId } });
  revalidatePath("/reunioes");
}

// Anexos: qualquer usuário autenticado pode subir. Arquivo vai pro
// Cloudinary (mesmo provedor do resto do módulo); guardamos só a referência
// no banco.
async function addMeetingAttachmentActionImpl(formData: FormData) {
  const session = await requireSession();
  const meetingId = String(formData.get("meetingId") ?? "");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Selecione um arquivo.");
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("Arquivo muito grande (máximo 4,5 MB).");
  }

  const meeting = await assertMeetingInTenant(meetingId, session.tenantId);

  const uploaded = await uploadToCloudinary(file, `reunioes/${meeting.id}`);

  await prisma.$transaction([
    prisma.performanceMeetingAttachment.create({
      data: {
        meetingId: meeting.id,
        uploadedById: session.userId,
        fileName: file.name,
        fileUrl: uploaded.url,
        fileSize: file.size,
        contentType: file.type || null,
      },
    }),
    prisma.performanceMeetingLog.create({
      data: {
        meetingId: meeting.id,
        actorId: session.userId,
        action: "ANEXO_ADICIONADO",
        detail: file.name,
      },
    }),
  ]);

  revalidatePath("/reunioes");
}

// Quem subiu o anexo pode excluir; Master/Gerente também podem (moderação).
async function deleteMeetingAttachmentActionImpl(attachmentId: string) {
  const session = await requireSession();
  const attachment = await prisma.performanceMeetingAttachment.findFirstOrThrow({
    where: { id: attachmentId },
    include: { meeting: true },
  });
  if (attachment.meeting.tenantId !== session.tenantId) throw new Error("FORBIDDEN");

  const canDelete =
    attachment.uploadedById === session.userId ||
    session.role === "MASTER" ||
    session.role === "GERENTE";
  if (!canDelete) throw new Error("Você não tem permissão para excluir este anexo.");

  await deleteFromCloudinary(attachment.fileUrl);

  await prisma.$transaction([
    prisma.performanceMeetingAttachment.delete({ where: { id: attachment.id } }),
    prisma.performanceMeetingLog.create({
      data: {
        meetingId: attachment.meetingId,
        actorId: session.userId,
        action: "ANEXO_REMOVIDO",
        detail: attachment.fileName,
      },
    }),
  ]);

  revalidatePath("/reunioes");
}

// Fronteira "safe" — ver comentário no topo do arquivo e src/lib/safeAction.ts.
export async function saveMeetingAction(input: SaveMeetingInput) {
  return safeAction(saveMeetingActionImpl)(input);
}
export async function deleteMeetingAction(meetingId: string) {
  return safeAction(deleteMeetingActionImpl)(meetingId);
}
export async function addMeetingNoteAction(meetingId: string, text: string) {
  return safeAction(addMeetingNoteActionImpl)(meetingId, text);
}
export async function updateMeetingNoteAction(noteId: string, text: string) {
  return safeAction(updateMeetingNoteActionImpl)(noteId, text);
}
export async function deleteMeetingNoteAction(noteId: string) {
  return safeAction(deleteMeetingNoteActionImpl)(noteId);
}
export async function addMeetingAttachmentAction(formData: FormData) {
  return safeAction(addMeetingAttachmentActionImpl)(formData);
}
export async function deleteMeetingAttachmentAction(attachmentId: string) {
  return safeAction(deleteMeetingAttachmentActionImpl)(attachmentId);
}
