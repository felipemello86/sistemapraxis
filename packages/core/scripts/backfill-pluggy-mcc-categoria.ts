// Preenche pluggyPayeeMcc / pluggyCategoria / pluggyMerchantCategoria dos
// lançamentos que já vieram da Pluggy ANTES desses 3 campos serem gravados
// no sync (pedido do Felipe, 06/08/2026: "capture também e também use como
// sugestão adicional (mesmo espírito do MCC)"). Sync novo (ver
// sincronizarContasDoTenant em pluggy.ts) já grava isso sempre — este script
// é só pra corrigir o histórico, do mesmo jeito que
// backfill-data-competencia.ts corrigiu a Data de Competência.
//
// Estratégia (mais rápida que buscarTransacao um por um, que é o que
// backfill-data-competencia.ts faz): pra cada conta conectada, busca o
// HISTÓRICO INTEIRO via listarTransacoes(accountId) — sem "desde" — que já
// pagina 500 por vez sozinho, e casa por pluggyTransactionId. Só recorre a
// buscarTransacao (uma chamada por transação) pras que sobrarem fora desse
// histórico (mais raro: transação muito antiga que já saiu da janela de
// retenção da Pluggy pro endpoint de listagem, mas talvez ainda exista no
// endpoint de busca individual).
//
// Uso:
//   cd packages/core && npx tsx scripts/backfill-pluggy-mcc-categoria.ts
//
// Idempotente e retomável: só toca lançamentos com os 3 campos ainda nulos,
// então dá pra interromper e rodar de novo — continua de onde parou.
// Transações que a Pluggy não tem mais em nenhum dos dois endpoints (comum
// pra compras parceladas antigas) ficam permanentemente sem esse dado —
// aceitável, é só metadata extra usada como sinal de sugestão.

import { prisma } from "../src/prisma";
import { listarTransacoes, buscarTransacao } from "../src/finance/pluggy";

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PAUSA_ENTRE_CHAMADAS_INDIVIDUAIS_MS = 120;

async function main() {
  const contas = await prisma.financeContaBancaria.findMany({
    where: { pluggyAccountId: { not: null } },
  });
  console.log(`${contas.length} conta(s) conectada(s).`);

  const mapaTransacoes = new Map<
    string,
    { payeeMcc: number | null; categoria: string | null; merchantCategoria: string | null }
  >();
  for (const conta of contas) {
    console.log(`Buscando histórico completo de "${conta.nome}" (${conta.tipo})...`);
    const transacoes = await listarTransacoes(conta.pluggyAccountId!);
    console.log(`  ${transacoes.length} transação(ões) retornada(s) pela Pluggy.`);
    for (const t of transacoes) {
      mapaTransacoes.set(t.id, {
        payeeMcc: t.creditCardMetadata?.payeeMCC ?? null,
        categoria: t.category ?? null,
        merchantCategoria: t.merchant?.category ?? null,
      });
    }
  }

  const pendentes = await prisma.financeLancamento.findMany({
    where: {
      origem: "PLUGGY",
      pluggyTransactionId: { not: null },
      pluggyPayeeMcc: null,
      pluggyCategoria: null,
      pluggyMerchantCategoria: null,
    },
  });
  console.log(`${pendentes.length} lançamento(s) pendente(s) de backfill no banco.`);

  const naoEncontrados: typeof pendentes = [];
  let atualizadosViaBulk = 0;
  for (const l of pendentes) {
    const t = mapaTransacoes.get(l.pluggyTransactionId!);
    if (!t) {
      naoEncontrados.push(l);
      continue;
    }
    await prisma.financeLancamento.update({
      where: { id: l.id },
      data: { pluggyPayeeMcc: t.payeeMcc, pluggyCategoria: t.categoria, pluggyMerchantCategoria: t.merchantCategoria },
    });
    atualizadosViaBulk++;
  }
  console.log(`Atualizados via listagem em lote: ${atualizadosViaBulk}. Não encontrados: ${naoEncontrados.length}.`);

  let atualizadosViaIndividual = 0;
  let falharam = 0;
  for (let i = 0; i < naoEncontrados.length; i++) {
    const l = naoEncontrados[i];
    try {
      const t = await buscarTransacao(l.pluggyTransactionId!);
      await prisma.financeLancamento.update({
        where: { id: l.id },
        data: {
          pluggyPayeeMcc: t.creditCardMetadata?.payeeMCC ?? null,
          pluggyCategoria: t.category ?? null,
          pluggyMerchantCategoria: t.merchant?.category ?? null,
        },
      });
      atualizadosViaIndividual++;
    } catch (e: any) {
      falharam++;
      console.error(`  falhou "${l.descricao}" (${l.id}): ${e.message}`);
    }
    await esperar(PAUSA_ENTRE_CHAMADAS_INDIVIDUAIS_MS);
  }

  console.log(`\n=== RESUMO ===`);
  console.log(`Via listagem em lote: ${atualizadosViaBulk}`);
  console.log(`Via busca individual: ${atualizadosViaIndividual}`);
  console.log(`Falharam (provavelmente transação antiga demais e já saiu do histórico da Pluggy — ajuste na mão se precisar): ${falharam}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
