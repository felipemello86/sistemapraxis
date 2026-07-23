import { redirect } from "next/navigation";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";
import { MeetingsBoard } from "@/components/reunioes/MeetingsBoard";
import type { Meeting } from "@/components/reunioes/types";

// Portado de apps/booking-reviews/src/app/(app)/reunioes/page.tsx (v1).
// companyId→tenantId; user.name→user.nome; `relationLoadStrategy: "join"`
// ligado (preview feature `relationJoins` habilitada no schema compartilhado
// — ver comentário no generator e em tratamento/page.tsx).
export default async function ReunioesPage() {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");

  const podeAcessar = await hasModuleAccess(session, "BOOKING_REVIEWS");
  // Volta pro hub do tenant (tiles + Sair), não pra landing genérica — ver
  // comentário equivalente em apps/booking-reviews/src/app/page.tsx.
  if (!podeAcessar) redirect(`${process.env.NEXT_PUBLIC_GATEWAY_URL || "https://sistemaspraxis.com.br"}/${session.tenantSlug}`);

  const [meetingsRaw, users] = await Promise.all([
    prisma.performanceMeeting.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { date: "desc" },
      include: {
        coordinator: { select: { id: true, nome: true } },
        participants: { include: { user: { select: { id: true, nome: true } } } },
        notes: { include: { author: { select: { nome: true } } }, orderBy: { createdAt: "asc" } },
        attachments: {
          include: { uploadedBy: { select: { nome: true } } },
          orderBy: { createdAt: "asc" },
        },
        logs: { include: { actor: { select: { nome: true } } }, orderBy: { createdAt: "asc" } },
      },
      relationLoadStrategy: "join",
    }),
    prisma.user.findMany({
      where: { tenantId: session.tenantId, ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, role: true },
    }),
  ]);

  const meetings: Meeting[] = meetingsRaw.map((m) => ({
    id: m.id,
    date: m.date.toISOString(),
    coordinatorId: m.coordinatorId,
    coordinatorName: m.coordinator.nome,
    participantIds: m.participants.map((p) => p.userId),
    participantNames: m.participants.map((p) => p.user.nome),
    notes: m.notes.map((n) => ({
      id: n.id,
      text: n.text,
      authorId: n.authorId,
      authorName: n.author.nome,
      createdAt: n.createdAt.toISOString(),
    })),
    attachments: m.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      fileUrl: a.fileUrl,
      fileSize: a.fileSize,
      uploadedById: a.uploadedById,
      uploadedByName: a.uploadedBy.nome,
      createdAt: a.createdAt.toISOString(),
    })),
    logs: m.logs.map((l) => ({
      id: l.id,
      action: l.action,
      detail: l.detail,
      actorName: l.actor?.nome ?? null,
      createdAt: l.createdAt.toISOString(),
    })),
  }));

  return (
    <MeetingsBoard
      meetings={meetings}
      users={users.map((u) => ({ id: u.id, name: u.nome, role: u.role }))}
      currentUserRole={session.role}
      currentUserId={session.userId}
    />
  );
}
