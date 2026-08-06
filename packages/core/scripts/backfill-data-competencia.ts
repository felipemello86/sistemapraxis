// Preenche a Data de Competência dos lançamentos que já vieram da Pluggy
// ANTES desse campo ser gravado no sync (pedido do Felipe, 05/08/2026, 3ª
// rodada: "o sistema deve manter a data que vem da Pluggy como data de
// competência"). Sync novo (ver sincronizarContasDoTenant em pluggy.ts) já
// grava isso sempre — este script é só pra corrigir o histórico.
//
// Por que precisa chamar a Pluggy de novo em vez de só ler do banco: pra
// cartão de crédito, a Data de Vencimento já foi reescrita pro dia da
// fatura (ver recalcular-vencimento-fatura.ts) — a data de compra original
// não sobrevive em nenhuma coluna. A única fonte de verdade que resta é a
// própria Pluggy, buscada de novo por pluggyTransactionId.
//
// Uso:
//   cd packages/core && npx tsx scripts/backfill-data-competencia.ts
//
// Idempotente e retomável: só toca lançamentos com dataCompetencia ainda
// nula, então dá pra interromper (Ctrl+C) e rodar de novo — continua de
// onde parou. Uma pequena pausa entre cada chamada evita estourar o rate
// limit da Pluggy (429); mesmo assim, se acontecer, pluggyFetch já
// re-tenta sozinho com backoff (ver pluggy.ts).

import { prisma } from "../src/prisma";
import { buscarTransacao } from "../src/finance/pluggy";

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PAUSA_ENTRE_CHAMADAS_MS = 150;

async function main() {
  const pendentes = await prisma.financeLancamento.findMany({
    where: { origem: "PLUGGY", dataCompetencia: null, pluggyTransactionId: { not: null } },
  });

  if (pendentes.length === 0) {
    console.log("Nenhum lançamento da Pluggy sem Data de Competência. Nada a fazer.");
    return;
  }

  console.log(`${pendentes.length} lançamento(s) sem Data de Competência — buscando a data real na Pluggy (uma por vez, com pausa pra não estourar o limite da API)...`);

  let ok = 0;
  let falhou = 0;
  for (let i = 0; i < pendentes.length; i++) {
    const l = pendentes[i];
    try {
      const transacao = await buscarTransacao(l.pluggyTransactionId!);
      await prisma.financeLancamento.update({
        where: { id: l.id },
        data: { dataCompetencia: transacao.date.slice(0, 10) },
      });
      ok++;
    } catch (e: any) {
      falhou++;
      console.error(`  falhou "${l.descricao}" (${l.id}, pluggyTransactionId=${l.pluggyTransactionId}): ${e.message}`);
    }

    if ((i + 1) % 100 === 0 || i === pendentes.length - 1) {
      console.log(`  ${i + 1}/${pendentes.length} processado(s) — ${ok} ok, ${falhou} falharam até agora.`);
    }

    await esperar(PAUSA_ENTRE_CHAMADAS_MS);
  }

  console.log(`\n${ok} lançamento(s) corrigido(s). ${falhou} falharam (provavelmente transação antiga demais e já saiu do histórico da Pluggy — ajuste na mão se precisar).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
