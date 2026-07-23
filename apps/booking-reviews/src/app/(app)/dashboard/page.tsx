import { redirect } from "next/navigation";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

// Portado de apps/booking-reviews/src/app/(app)/dashboard/page.tsx (v1).
// company.targetScore → prisma.reviewsConfig (model próprio no v2, em vez de
// campo solto em Company — ver ReviewsConfig no schema); companyId→tenantId;
// Property já é FK real (não precisa de match de texto).
// `relationLoadStrategy: "join"` ligado (preview feature `relationJoins`
// habilitada no schema compartilhado — ver comentário no generator e em
// tratamento/page.tsx).
export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");

  const podeAcessar = await hasModuleAccess(session, "BOOKING_REVIEWS");
  // Volta pro hub do tenant (tiles + Sair), não pra landing genérica — ver
  // comentário equivalente em apps/booking-reviews/src/app/page.tsx.
  if (!podeAcessar) redirect(`${process.env.NEXT_PUBLIC_GATEWAY_URL || "https://sistemaspraxis.com.br"}/${session.tenantSlug}`);

  const [config, reviews, properties] = await Promise.all([
    prisma.reviewsConfig.findUnique({ where: { tenantId: session.tenantId } }),
    prisma.review.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { guestSubmittedAt: "desc" },
      include: {
        property: true,
        // Só avaliações que passaram por Análise & Planejamento têm
        // categorias — as de nota 5 (skippedToFinal) vêm sempre vazias aqui,
        // e por isso ficam de fora do gráfico de pizza no dashboard.
        categories: { include: { category: true } },
      },
      take: 500,
      relationLoadStrategy: "join",
    }),
    prisma.property.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { nome: "asc" },
    }),
  ]);

  return (
    <DashboardClient
      targetScore={config?.targetScore ?? 4.8}
      properties={properties.map((p) => ({ id: p.id, nome: p.nome }))}
      reviews={reviews.map((r) => ({
        id: r.id,
        guestName: r.guestName,
        platform: r.platform,
        comment: r.comment,
        ratingNormalized: r.ratingNormalized,
        ratingRaw: r.ratingRaw,
        ratingScaleMax: r.ratingScaleMax,
        guestSubmittedAt: r.guestSubmittedAt.toISOString(),
        propertyId: r.propertyId,
        propertyLabel: r.property?.nome ?? null,
        stage: r.stage,
        categories: r.categories.map((c) => ({ id: c.categoryId, name: c.category.name })),
      }))}
    />
  );
}
