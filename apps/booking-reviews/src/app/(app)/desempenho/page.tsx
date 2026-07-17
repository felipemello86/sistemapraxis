import { redirect } from "next/navigation";
import { getSession, hasModuleAccess, prisma } from "@praxis/core";
import { AttendantCard } from "@/components/desempenho/AttendantCard";

// Portado de apps/booking-reviews/src/app/(app)/desempenho/page.tsx (v1).
// companyId→tenantId; role "ATENDENTE" (v1) → "ATENDIMENTO" (v2, mesmo ajuste
// já feito em tratamento/actions.ts); relação attendantScores → chama
// reviewAttendantScores no schema compartilhado (nome do relation field em
// User, ver ReviewAttendant no schema). `relationLoadStrategy: "join"`
// ligado (preview feature `relationJoins` habilitada no schema compartilhado
// — ver comentário no generator e em tratamento/page.tsx).
export default async function DesempenhoPage() {
  const session = await getSession();
  if (!session) redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");

  const podeAcessar = await hasModuleAccess(session, "BOOKING_REVIEWS");
  if (!podeAcessar) redirect(process.env.NEXT_PUBLIC_GATEWAY_URL || "/");

  const attendants = await prisma.user.findMany({
    where: { tenantId: session.tenantId, role: "ATENDIMENTO" },
    include: {
      reviewAttendantScores: { include: { review: true }, orderBy: { id: "desc" } },
    },
    orderBy: { nome: "asc" },
    relationLoadStrategy: "join",
  });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-800">Performance</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {attendants.map((a) => (
          <AttendantCard
            key={a.id}
            name={a.nome}
            scores={a.reviewAttendantScores.map((s) => ({
              id: s.id,
              reviewId: s.review.id,
              guestName: s.review.guestName,
              platform: s.review.platform,
              observation: s.observation,
              score: s.score,
              guestSubmittedAt: s.review.guestSubmittedAt.toISOString(),
            }))}
          />
        ))}
        {attendants.length === 0 && (
          <p className="text-sm text-slate-400">
            Nenhuma atendente cadastrada. Cadastre em Configurações.
          </p>
        )}
      </div>
    </div>
  );
}
