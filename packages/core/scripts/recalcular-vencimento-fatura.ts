// Recalcula a Data de Vencimento das compras de cartão de crédito já
// sincronizadas via Pluggy, depois que o Felipe configura o dia de
// FECHAMENTO da fatura em Configurações > Cartões de Crédito (pedido dele,
// 05/08/2026, 2ª rodada: "todo cartão de crédito deve ter um dia de
// fechamento da fatura... ao selecionar o mês de agosto, devem ser exibidos
// os lançamentos compreendidos no período de 2/julho a 1/agosto").
//
// *** PREMISSA IMPORTANTE, leia antes de rodar ***
// Este script assume que a FinanceLancamento.dataVencimento ATUAL de cada
// compra ainda é a DATA DA COMPRA crua (não transformada) — verdade pra
// qualquer cartão que nunca teve diaVencimentoFatura configurado antes
// (o caso de todos os cartões até agora, 05/08/2026 — a Data de Vencimento
// só virava a data da compra em si, sem transformação nenhuma). Se no
// futuro algum cartão já tiver passado pela regra antiga (só vencimento,
// sem fechamento — "sempre mês seguinte") ANTES de rodar isto, a data da
// compra original já foi perdida nessas linhas e este script vai
// recalcular a partir de uma base errada. Não há como o script detectar
// esse caso sozinho — se isso for uma preocupação, avise antes de rodar.
//
// Uso:
//   cd packages/core && npx tsx scripts/recalcular-vencimento-fatura.ts
//
// Idempotente-ish: rodar de novo sobre linhas já recalculadas vai
// re-derivar a MESMA fatura de vencimento (a função é determinística a
// partir da data-base), então não piora nada — mas só faz sentido rodar
// uma vez, logo depois de configurar fechamento+vencimento de cada cartão.

import { prisma } from "../src/prisma";
import { calcularVencimentoFatura } from "../src/finance/pluggy";

async function main() {
  const cartoes = await prisma.financeContaBancaria.findMany({
    where: { tipo: "CREDIT", diaVencimentoFatura: { not: null }, diaFechamentoFatura: { not: null } },
    include: { contaConectada: { select: { instituicao: true } }, tenant: { select: { slug: true } } },
  });

  if (cartoes.length === 0) {
    console.log("Nenhum cartão com fechamento + vencimento configurados ainda. Configure em Configurações > Cartões de Crédito primeiro.");
    return;
  }

  for (const cartao of cartoes) {
    const lancamentos = await prisma.financeLancamento.findMany({
      where: { contaBancariaId: cartao.id, origem: "PLUGGY" },
    });

    if (lancamentos.length === 0) {
      console.log(`[${cartao.tenant.slug}] ${cartao.nome} (${cartao.contaConectada.instituicao}): sem lançamentos sincronizados, nada a fazer.`);
      continue;
    }

    console.log(`\n[${cartao.tenant.slug}] ${cartao.nome} (${cartao.contaConectada.instituicao}): recalculando ${lancamentos.length} lançamento(s)...`);
    let alterados = 0;
    for (const l of lancamentos) {
      const novaData = calcularVencimentoFatura(l.dataVencimento, cartao.diaVencimentoFatura!, cartao.diaFechamentoFatura);
      if (novaData !== l.dataVencimento) {
        await prisma.financeLancamento.update({ where: { id: l.id }, data: { dataVencimento: novaData } });
        alterados++;
      }
    }
    console.log(`  ${alterados} lançamento(s) tiveram a Data de Vencimento ajustada pro ciclo real da fatura.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
