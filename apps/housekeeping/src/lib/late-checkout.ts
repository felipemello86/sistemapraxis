import { prisma, sendPushToUser } from "@praxis/core";

// Late Check-out — Atendimento marca uma UH pra ser liberada mais tarde (com
// hora de saída obrigatória) em vez de seguir o fluxo normal, onde alguém
// libera manualmente assim que o hóspede sai. Este módulo concentra a
// checagem de "hora chegou, libera sozinho".
//
// Comparação de horário sempre em America/Sao_Paulo (mesmo fuso operacional
// usado no resto do app, ver api/uh-detail/route.ts) — nunca UTC puro, que é
// o fuso da Vercel.

function horaAtualSP(): string {
  return new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  });
}

function dataAtualSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * Libera automaticamente as UHs marcadas como Late Check-out cuja hora de
 * saída (lateCheckoutHora, "HH:mm") já passou. Best-effort: chamado como
 * efeito colateral no GET de Seleção e Liberação e do Tempo Real (as telas
 * mais acessadas ao longo do dia) e também pelo cron dedicado
 * (api/cron/late-checkout) — assim funciona mesmo sem ninguém com uma tela
 * aberta. Nunca deve derrubar quem chamou; erros ficam só no log.
 */
export async function liberarLateCheckoutsVencidos(tenantId: string): Promise<void> {
  const data = dataAtualSP();
  const horaAtual = horaAtualSP();

  const vencidas = await prisma.dailyUHSelection.findMany({
    where: {
      tenantId,
      data,
      lateCheckout: true,
      liberada: false,
      lateCheckoutHora: { lte: horaAtual },
    },
    select: { uhId: true, uh: { select: { numero: true } } },
  });
  if (vencidas.length === 0) return;

  for (const { uhId, uh } of vencidas) {
    await prisma.dailyUHSelection.update({
      where: { data_uhId: { data, uhId } },
      data: { liberada: true, liberadaEm: new Date(), liberadoPorNome: "Sistema (Late Check-out)" },
    });

    // Pode haver mais de uma DailyAssignment na mesma UH/dia (mutirão) —
    // libera todas, igual o fluxo manual faria uma a uma.
    const assignments = await prisma.dailyAssignment.findMany({
      where: { tenantId, data, uhId },
      select: { id: true, camareiraId: true },
    });
    for (const assignment of assignments) {
      await prisma.dailyAssignment.update({
        where: { id: assignment.id },
        data: { status: "LIBERADO", liberadaEm: new Date() },
      });
      void sendPushToUser(assignment.camareiraId, {
        title: "UH liberada",
        body: `A UH ${uh.numero} foi liberada pra limpeza (late check-out).`,
        data: { tipo: "liberacao", uhId, data },
      });
    }
  }
}
