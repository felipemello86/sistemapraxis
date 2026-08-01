import { prisma } from "./prisma";
import { notificarPorRoles } from "./notify";
import { emitEvent } from "./aiEvents";

// Pedido explícito do Felipe (01/08/2026, tela Seleção e Liberação de
// Housekeeping): "ao clicar nesse botão de lixeira (excluir a UH da lista do
// dia), isso deve repercutir na programação da manutenção, excluindo
// qualquer card de NC associado a essa UH excluída do dia e tb gerando uma
// notificação para o perfil Manutenção. O card deve aparecer na coluna de
// Planejadas como esmaecida e tachada. Porém, ainda deve ser possível Marcar
// como Executado nesse card. [...] esse card deve ser excluído do somatório
// de cards com expectativa de serem executados no dia [...], mas, se mesmo
// assim acontecer do Manutencista executar o card, ele deve entrar como se
// fosse 'Não Previsto'."
//
// Chamada pela ação "renovar" de apps/housekeeping/src/app/api/selecao-uhs/
// route.ts, ANTES do prisma.dailyUHSelection.delete que de fato tira a UH da
// lista do dia. Cancela (NÃO apaga) os cards do Kanban de Execução da
// Manutenção que ainda estão em aberto pra essa UH:
//   - executionStatus A_FAZER: cards ainda não anexados a nenhuma
//     programação fechada (sem campo de dia próprio, ver comentário no
//     schema) — saem da lista "A Fazer" da UI (ver kanban-execucao.tsx, cuja
//     lista já é filtrada por uhIdsSelecionadasHoje), mas continuam
//     existindo, cancelados.
//   - executionStatus PLANEJADA da MESMA programação (MaintenanceDailyCommitment)
//     de hoje: é o caso do pedido ("coluna de Planejadas") — fica visível,
//     esmaecido/tachado, ainda executável.
//
// `previsto: false` é setado nos dois casos: reaproveita o MESMO mecanismo
// já usado pelos cards intempestivos (ver adicionarCardUrgenteImpl em
// apps/maintenance/src/app/actions/correcao.ts) — se um card com
// previsto=false for executado, o relatório do dia já trata isso como "Não
// previsto" automaticamente (badge amarelo + fora do denominador
// totalPrevisto), exatamente o pedido do Felipe, sem duplicar lógica de
// cálculo. `canceladoPorLiberacao`/`canceladoEm` são um flag PRÓPRIO, só pra
// diferenciar visualmente esse motivo (UH saiu da programação) do caso de
// card intempestivo de verdade (trabalho novo legítimo, que não deve
// aparecer cancelado/riscado).
//
// Se o card já fazia parte de um MaintenanceDailyCommitment JÁ FECHADO
// (totalPrevisto congelado no momento do fechamento, ver
// fecharProgramacaoDiaImpl), este congelamento não se recalcula sozinho —
// por isso decrementa totalPrevisto aqui manualmente pra cada card que
// estava previsto=true antes deste cancelamento (senão o denominador
// continuaria contando um card que não deveria mais entrar na conta).
export async function cancelarCardsPorExclusaoDeUh(params: {
  tenantId: string;
  uhId: string;
  data: string;
  atorNome: string;
}) {
  const { tenantId, uhId, data, atorNome } = params;

  const uh = await prisma.uH.findUnique({ where: { id: uhId }, select: { numero: true } });
  if (!uh) return;

  const commitmentHoje = await prisma.maintenanceDailyCommitment.findUnique({
    where: { tenantId_data: { tenantId, data } },
  });

  const cardsAbertos = await prisma.maintenanceCorrectionCard.findMany({
    where: {
      tenantId,
      uhId,
      canceladoPorLiberacao: false,
      executionStatus: { in: ["A_FAZER", "PLANEJADA"] },
    },
    include: { checklistItem: { select: { name: true } } },
  });

  // Uma PLANEJADA só é "de hoje" se pertencer ao commitment de hoje (não
  // deveria existir PLANEJADA de outro dia — todo commitment fecha no mesmo
  // dia — mas o filtro documenta a intenção e protege contra dado
  // inconsistente).
  const cards = cardsAbertos.filter(
    (c) => c.executionStatus === "A_FAZER" || c.dailyCommitmentId === commitmentHoje?.id,
  );

  if (cards.length === 0) return;

  await prisma.$transaction(
    cards.map((c) =>
      prisma.maintenanceCorrectionCard.update({
        where: { id: c.id },
        data: { canceladoPorLiberacao: true, canceladoEm: new Date(), previsto: false },
      }),
    ),
  );

  // Só decrementa pelos que JÁ estavam contados no denominador congelado
  // (PLANEJADA + previsto ainda true antes deste update) — cards A_FAZER
  // nunca entraram em nenhum totalPrevisto ainda.
  const decremento = cards.filter((c) => c.executionStatus === "PLANEJADA" && c.previsto).length;
  if (decremento > 0 && commitmentHoje) {
    await prisma.maintenanceDailyCommitment.update({
      where: { id: commitmentHoje.id },
      data: { totalPrevisto: { decrement: decremento } },
    });
  }

  await notificarPorRoles(tenantId, ["MANUTENCAO"], {
    title: "🗑️ UH removida da programação de hoje",
    body: `UH ${uh.numero} foi excluída da lista do dia — ${cards.length} ${
      cards.length === 1 ? "card de manutenção foi cancelado" : "cards de manutenção foram cancelados"
    }.`,
    data: { view: "correcao" },
  });

  await emitEvent({
    tenantId,
    module: "MAINTENANCE",
    eventType: "maintenance.log.cards_cancelados_por_liberacao",
    entityType: "UH",
    entityId: uhId,
    payload: {
      uhNumero: uh.numero,
      totalCancelados: cards.length,
      cards: cards.map((c) => ({ id: c.id, itemNome: c.checklistItem?.name ?? null })),
      atorNome,
    },
  });
}
