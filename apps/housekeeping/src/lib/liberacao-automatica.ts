import { prisma, sendPushToUser, notificarPorRoles, emitEvent } from "@praxis/core";
import { dataAtualSP } from "./timezone";

// Liberação automática ao meio-dia — pedido explícito do Felipe: toda UH
// SELECIONADA pra hoje (tem linha em DailyUHSelection, mesmo critério de
// "selecionada" usado em Manutenção — ver uhIdsSelecionadasHoje) que ainda
// não foi liberada manualmente até o meio-dia é liberada sozinha pelo
// sistema, pra não travar a limpeza esperando a Governanta agir uma a uma.
//
// Exclui UHs com Late Check-out marcado (lateCheckout: true) — essas já têm
// seu próprio horário de liberação automática, definido UH a UH em
// lateCheckoutHora (ver late-checkout.ts); forçar meio-dia nelas
// atropelaria esse horário combinado com o hóspede.
//
// Mesmo padrão de liberarLateCheckoutsVencidos: cron dedicado
// (api/cron/liberacao-automatica, uma vez ao meio-dia) + melhor esforço no
// GET de /api/selecao-uhs (roda sempre que a tela é aberta depois do
// meio-dia, mesmo que o cron ainda não tenha passado). Nunca deve derrubar
// quem chamou; erros ficam só no log.
export async function liberarSelecionadasAoMeioDia(tenantId: string): Promise<void> {
  const data = dataAtualSP();

  const pendentes = await prisma.dailyUHSelection.findMany({
    where: { tenantId, data, liberada: false, lateCheckout: false },
    select: { uhId: true, uh: { select: { numero: true } } },
  });
  if (pendentes.length === 0) return;

  for (const { uhId, uh } of pendentes) {
    await prisma.dailyUHSelection.update({
      where: { data_uhId: { data, uhId } },
      data: { liberada: true, liberadaEm: new Date(), liberadoPorNome: "Sistema (liberação automática)" },
    });

    await emitEvent({
      tenantId,
      module: "HOUSEKEEPING",
      eventType: "housekeeping.selecao.liberacao_automatica",
      entityType: "UH",
      entityId: uhId,
      payload: { data },
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
      await sendPushToUser(assignment.camareiraId, {
        title: "UH liberada",
        body: `A UH ${uh.numero} foi liberada automaticamente pra limpeza (meio-dia).`,
        data: { tipo: "liberacao", uhId, data },
      });
    }
  }

  await notificarPorRoles(tenantId, ["GOVERNANTA", "GERENTE", "MASTER"], {
    title: "🕛 Liberação automática ao meio-dia",
    body: `${pendentes.length} UH(s) selecionada(s) foram liberadas automaticamente pra limpeza.`,
    data: { view: "selecao" },
  });
}
