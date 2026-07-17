import { redirect } from "next/navigation";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";

// Portado de apps/booking-reviews/src/app/(app)/tratamento/page.tsx (v1).
// companyId→tenantId; Property agora é FK real (não match de texto) — a
// review se associa a Property, não a UH (Booking/Airbnb só informam a
// propriedade/anúncio, nunca a UH específica onde o hóspede ficou); bloco
// reworkRequests removido (model não existe mais — ver comentário no
// schema). Adicionado hasModuleAccess (v1 não tinha, mas o resto da suíte v2
// checa em toda página por defesa em profundidade, além do check no
// layout/nas próprias Server Actions).
export default async function TratamentoPage() {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");

  const podeAcessar = await hasModuleAccess(session, "BOOKING_REVIEWS");
  if (!podeAcessar) redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");

  const [reviews, attendants, categories, properties, pendingImports] = await Promise.all([
    prisma.review.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { guestSubmittedAt: "desc" },
      include: {
        property: true,
        attendants: { include: { attendant: true } },
        categories: { include: { category: true } },
        actionPlan: { include: { items: { include: { completedBy: true } } } },
        efficacyChecks: true,
        managerialNotes: { include: { author: true }, orderBy: { createdAt: "desc" } },
        attachments: { include: { uploadedBy: true }, orderBy: { createdAt: "desc" } },
        logs: { include: { actor: true }, orderBy: { createdAt: "desc" } },
      },
      // Nota: o v1 usava `relationLoadStrategy: "join"` aqui (preview feature
      // "relationJoins" do Prisma) pra reduzir de ~9 idas ao banco pra 1. O
      // schema compartilhado do v2 não tem essa preview feature habilitada
      // no generator (nenhum outro app da suíte usa) — não vale habilitar só
      // por causa desta consulta. Sem o join, o Prisma resolve as inclusions
      // com queries separadas (comportamento padrão), só um pouco mais lento.
    }),
    prisma.user.findMany({
      where: { tenantId: session.tenantId, role: "ATENDIMENTO", ativo: true },
      orderBy: { nome: "asc" },
    }),
    prisma.category.findMany({
      where: { tenantId: session.tenantId, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.property.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { nome: "asc" },
    }),
    prisma.pendingAirbnbImport.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { guestSubmittedAt: "desc" },
    }),
  ]);

  const serialized = reviews.map((r) => ({
    id: r.id,
    guestName: r.guestName,
    platform: r.platform,
    comment: r.comment,
    ratingNormalized: r.ratingNormalized,
    ratingRaw: r.ratingRaw,
    ratingScaleMax: r.ratingScaleMax,
    guestSubmittedAt: r.guestSubmittedAt.toISOString(),
    propertyId: r.propertyId,
    propertyNome: r.property?.nome ?? null,
    checkInDate: r.checkInDate?.toISOString() ?? null,
    stage: r.stage,
    skippedToFinal: r.skippedToFinal,
    analysisDueAt: r.analysisDueAt?.toISOString() ?? null,
    attendants: r.attendants.map((a) => ({
      attendantId: a.attendantId,
      name: a.attendant.nome,
      score: a.score,
      observation: a.observation,
    })),
    categoryIds: r.categories.map((c) => c.categoryId),
    actionItems: (r.actionPlan?.items ?? []).map((i) => ({
      id: i.id,
      description: i.description,
      dueDate: i.dueDate.toISOString(),
      completedAt: i.completedAt?.toISOString() ?? null,
      completedByName: i.completedBy?.nome ?? null,
    })),
    efficacyChecks: r.efficacyChecks.map((e) => ({
      id: e.id,
      scheduledDate: e.scheduledDate.toISOString(),
      description: e.description,
      completedAt: e.completedAt?.toISOString() ?? null,
      wasEffective: e.wasEffective,
      notes: e.notes,
    })),
    managerialNotes: r.managerialNotes.map((n) => ({
      id: n.id,
      text: n.text,
      authorId: n.authorId,
      authorName: n.author.nome,
      createdAt: n.createdAt.toISOString(),
    })),
    attachments: r.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      fileUrl: a.fileUrl,
      fileSize: a.fileSize,
      contentType: a.contentType,
      uploadedById: a.uploadedById,
      uploadedByName: a.uploadedBy.nome,
      createdAt: a.createdAt.toISOString(),
    })),
    logs: r.logs.map((l) => ({
      id: l.id,
      action: l.action,
      detail: l.detail,
      actorName: l.actor.nome,
      createdAt: l.createdAt.toISOString(),
    })),
  }));

  return (
    <KanbanBoard
      reviews={serialized}
      attendants={attendants.map((a) => ({ id: a.id, name: a.nome }))}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      properties={properties.map((p) => ({ id: p.id, nome: p.nome }))}
      pendingImports={pendingImports.map((p) => ({
        id: p.id,
        guestName: p.guestName,
        ratingRaw: p.ratingRaw,
        guestSubmittedAt: p.guestSubmittedAt.toISOString(),
        checkInDate: p.checkInDate?.toISOString() ?? null,
      }))}
      currentUserRole={session.role}
      currentUserId={session.userId}
    />
  );
}
