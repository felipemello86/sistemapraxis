// Corrige DailyAssignment/UH que ficaram com status desatualizado
// (CONCLUIDO/LIBERADO/EM_ANDAMENTO/PENDENTE) mesmo já tendo uma
// InspectionSession finalizada — bug relatado pelo Felipe (05/08/2026): card
// "empancado" na coluna Inspeção do Quadro (Tempo Real) mesmo já tendo o
// evento "C" (Check-in Liberado) registrado, depois de usar "Limpeza sem
// Registro" numa UH que a Governanta já tinha inspecionado. A causa raiz foi
// corrigida em apps/housekeeping/src/app/api/selecao-uhs/route.ts (ação
// limpeza_sem_registro) — este script é só o reparo pontual dos dados que já
// ficaram inconsistentes antes da correção.
//
// Roda em todos os tenants (não é bug específico da bnbflex) e é seguro
// rodar mais de uma vez — só corrige o que realmente está divergente.
//
//   npx tsx scripts/fix-status-atrasado-pos-inspecao.ts

import { prisma } from "../src/prisma";

async function main() {
  const divergentes = await prisma.dailyAssignment.findMany({
    where: {
      status: { not: "INSPECIONADO" },
      cleaningSession: { inspection: { finalizadaEm: { not: null } } },
    },
    select: {
      id: true,
      status: true,
      data: true,
      uhId: true,
      uh: { select: { numero: true, status: true } },
    },
  });

  if (divergentes.length === 0) {
    console.log("Nenhuma atribuição divergente encontrada — nada a corrigir.");
    return;
  }

  console.log(`${divergentes.length} atribuição(ões) divergente(s) encontrada(s):`);
  for (const a of divergentes) {
    console.log(`  UH ${a.uh.numero} (${a.data}) — status ${a.status} → INSPECIONADO`);
    await prisma.dailyAssignment.update({ where: { id: a.id }, data: { status: "INSPECIONADO" } });
    if (a.uh.status !== "PRONTO") {
      await prisma.uH.update({ where: { id: a.uhId }, data: { status: "PRONTO" } });
    }
  }

  console.log("Correção concluída.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
