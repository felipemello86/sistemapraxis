import { redirect } from "next/navigation";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";
import { CompromissosClient } from "@/components/compromissos/CompromissosClient";

// Portado de apps/booking-reviews/src/app/(app)/compromissos/page.tsx (v1).
// companyId→tenantId; `relationLoadStrategy: "join"` ligado nas 3 queries
// (preview feature `relationJoins` habilitada no schema compartilhado — ver
// comentário no generator e em tratamento/page.tsx). Nada aqui referencia
// Property/UH.
export default async function CompromissosPage() {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");

  const podeAcessar = await hasModuleAccess(session, "BOOKING_REVIEWS");
  if (!podeAcessar) redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");

  const [overdueItems, doneItems, efficacyChecks] = await Promise.all([
    prisma.actionItem.findMany({
      where: {
        completedAt: null,
        dueDate: { lt: new Date() },
        actionPlan: { review: { tenantId: session.tenantId } },
      },
      include: { actionPlan: { include: { review: true } } },
      orderBy: { dueDate: "asc" },
      relationLoadStrategy: "join",
    }),
    prisma.actionItem.findMany({
      where: {
        completedAt: { not: null },
        actionPlan: { review: { tenantId: session.tenantId } },
      },
      include: { actionPlan: { include: { review: true } }, completedBy: true },
      orderBy: { completedAt: "desc" },
      take: 100,
      relationLoadStrategy: "join",
    }),
    prisma.efficacyCheck.findMany({
      where: { review: { tenantId: session.tenantId } },
      include: { review: true },
      orderBy: { scheduledDate: "desc" },
      take: 100,
      relationLoadStrategy: "join",
    }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-800">Compromissos e Prazos</h1>

      <CompromissosClient
        overdueItems={overdueItems.map((i) => ({
          id: i.id,
          description: i.description,
          dueDate: i.dueDate.toISOString(),
          reviewId: i.actionPlan.review.id,
          guestName: i.actionPlan.review.guestName,
          rating: i.actionPlan.review.ratingNormalized,
        }))}
        doneItems={doneItems.map((i) => ({
          id: i.id,
          description: i.description,
          dueDate: i.dueDate.toISOString(),
          completedAt: (i.completedAt ?? i.dueDate).toISOString(),
          reviewId: i.actionPlan.review.id,
          guestName: i.actionPlan.review.guestName,
          rating: i.actionPlan.review.ratingNormalized,
        }))}
        efficacyItems={efficacyChecks.map((c) => ({
          id: c.id,
          reviewId: c.review.id,
          guestName: c.review.guestName,
          scheduledDate: c.scheduledDate.toISOString(),
          completedAt: c.completedAt ? c.completedAt.toISOString() : null,
          wasEffective: c.wasEffective,
        }))}
      />
    </div>
  );
}
