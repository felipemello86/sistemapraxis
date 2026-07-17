import { prisma, type ReviewAlertType } from "@praxis/core";
import { sendTelegramMessage } from "@/lib/telegram";

// Portado de apps/booking-reviews/src/lib/alerts.ts (v1). companyId →
// tenantId; AlertType (Prisma Client local) → ReviewAlertType (exportado por
// @praxis/core).

// Link direto pro card no Kanban — a tela de Tratamento já lê ?reviewId= da
// URL e abre o card automaticamente (ver KanbanBoard.tsx).
export function reviewLink(reviewId: string): string {
  const base = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "https://sistemaspraxis.com.br";
  return `${base}/tratamento?reviewId=${reviewId}`;
}

// Usado tanto pelas Server Actions de tratamento/ quanto pelo cron de prazos
// (bloco futuro) — por isso vive num módulo à parte, sem "use server".
export async function logAlert(params: {
  tenantId: string;
  type: ReviewAlertType;
  message: string;
  targetUserIds: string[];
  reviewId?: string;
}) {
  // Registra o histórico do alerta e, em paralelo, manda pelo Telegram pra
  // quem tiver o Telegram vinculado. Se targetUserIds vier vazio (a maioria
  // dos eventos hoje), o padrão é notificar Master e Gerente — são quem
  // acompanha o fluxo como um todo; eventos que já sabem exatamente quem
  // avisar (ex: avaliação de atendimento) continuam passando targetUserIds
  // explícito.
  const fullMessage = params.reviewId
    ? `${params.message}\n\n🔗 ${reviewLink(params.reviewId)}`
    : params.message;

  const recipients =
    params.targetUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: params.targetUserIds }, telegramChatId: { not: null } },
        })
      : await prisma.user.findMany({
          where: {
            tenantId: params.tenantId,
            role: { in: ["MASTER", "GERENTE"] },
            ativo: true,
            telegramChatId: { not: null },
          },
        });

  await Promise.all([
    prisma.alert.create({
      data: {
        tenantId: params.tenantId,
        type: params.type,
        channel: "TELEGRAM",
        message: fullMessage,
        targetUserIds: params.targetUserIds,
        reviewId: params.reviewId,
      },
    }),
    ...recipients.map((u) => sendTelegramMessage(u.telegramChatId!, `🔔 ${fullMessage}`)),
  ]);
}
