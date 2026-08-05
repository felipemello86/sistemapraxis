// Backfill dos blocos configuráveis (pedido do Felipe, 05/08/2026): antes
// disso, "bloco" era uma string fixa (enum de 8 valores) direto em
// FinanceCategoria. Agora é uma tabela própria (FinanceBloco), editável em
// Configurações. Este script migra os DADOS existentes — a estrutura nova
// (tabela FinanceBloco, coluna FinanceCategoria.blocoId nullable) já foi
// criada pela migration 20260805150000_finance_blocos_configuraveis.
//
// O que este script faz, em ordem, por tenant com o módulo FINANCE
// habilitado:
//   1. Cria os 8 blocos default (mesmos nomes/fórmula que já existiam,
//      agora como linhas em FinanceBloco) — upsert, não duplica se já rodou.
//   2. Aponta cada FinanceCategoria.blocoId pro bloco certo, usando o valor
//      antigo da coluna "bloco" (lido via SQL cru, já que o Prisma Client
//      novo não conhece mais essa coluna — MAPA_CHAVE_ANTIGA_PARA_BLOCO
//      abaixo é o "de-para").
//   3. Atualiza FinanceOrcamento.alvoChave pra quem tinha alvoTipo=BLOCO
//      (antes guardava a chave antiga tipo "RECEITA_BRUTA", agora guarda o
//      id do FinanceBloco).
//   4. SÓ SE tudo acima fechou sem sobrar categoria com blocoId nulo:
//      finaliza o schema (NOT NULL + FK + índice novo + drop da coluna
//      "bloco" antiga). Se sobrar algo, aborta ANTES dessa parte pra não
//      deixar o banco num estado quebrado — dá pra rodar de novo depois de
//      investigar.
//
// Idempotente: se a coluna "bloco" já não existir mais (migração já rodou
// até o fim), o script detecta e sai sem fazer nada.
//
// Uso:
//   cd packages/core && npx tsx scripts/migrar-blocos-financeiro.ts

import { prisma } from "../src/prisma";
import { DEFAULT_FINANCE_BLOCOS } from "../src/finance/categoria-defaults";

const MAPA_CHAVE_ANTIGA_PARA_BLOCO: Record<string, string> = {
  RECEITA_BRUTA: "Receita Bruta",
  GASTOS_VARIAVEIS: "Gastos Variáveis",
  DESPESAS_VEICULOS: "Despesas com Veículos e Transporte",
  DESPESAS_FUNCIONARIOS: "Despesas com Funcionários",
  DESPESAS_ADMINISTRATIVAS: "Despesas Administrativas e Comerciais",
  DESPESAS_SEDE: "Despesas com Sede e Estrutura",
  DESPESAS_DIRETORIA: "Despesas com Diretoria",
  FINANCEIRAS: "Despesas e Receitas Financeiras",
};

async function colunaBlocoAindaExiste(): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'FinanceCategoria' AND column_name = 'bloco'
     ) as exists`
  );
  return rows[0]?.exists ?? false;
}

async function main() {
  if (!(await colunaBlocoAindaExiste())) {
    console.log("Coluna \"bloco\" antiga já não existe mais — migração já foi concluída antes. Nada a fazer.");
    return;
  }

  const tenants = await prisma.tenant.findMany({
    where: { modules: { some: { module: "FINANCE", enabled: true } } },
  });

  if (tenants.length === 0) {
    console.log("Nenhum tenant com módulo FINANCE habilitado — nada a migrar.");
  }

  for (const tenant of tenants) {
    console.log(`\n--- Tenant "${tenant.slug}" ---`);

    // 1. Blocos default (upsert por nome — não duplica em re-execução)
    const blocoIdPorNome = new Map<string, string>();
    for (const b of DEFAULT_FINANCE_BLOCOS) {
      const bloco = await prisma.financeBloco.upsert({
        where: { tenantId_nome: { tenantId: tenant.id, nome: b.nome } },
        update: {},
        create: { tenantId: tenant.id, nome: b.nome, ordem: b.ordem, totalizador: b.totalizador, sinal: b.sinal },
      });
      blocoIdPorNome.set(b.nome, bloco.id);
    }
    console.log(`${blocoIdPorNome.size} bloco(s) prontos.`);

    // 2. FinanceCategoria.blocoId a partir da coluna antiga
    const categoriasAntigas = await prisma.$queryRawUnsafe<{ id: string; bloco: string }[]>(
      `SELECT id, bloco FROM "FinanceCategoria" WHERE "tenantId" = $1 AND "blocoId" IS NULL`,
      tenant.id
    );
    let categoriasMigradas = 0;
    for (const c of categoriasAntigas) {
      const nomeBloco = MAPA_CHAVE_ANTIGA_PARA_BLOCO[c.bloco];
      if (!nomeBloco) throw new Error(`Categoria ${c.id}: valor de "bloco" desconhecido: "${c.bloco}" (confira MAPA_CHAVE_ANTIGA_PARA_BLOCO).`);
      const blocoId = blocoIdPorNome.get(nomeBloco);
      if (!blocoId) throw new Error(`Bloco "${nomeBloco}" não encontrado pro tenant "${tenant.slug}".`);
      await prisma.financeCategoria.update({ where: { id: c.id }, data: { blocoId } });
      categoriasMigradas++;
    }
    console.log(`${categoriasMigradas} categoria(s) migrada(s) pro novo blocoId.`);

    // 3. FinanceOrcamento.alvoChave pra quem tinha alvoTipo=BLOCO
    const orcamentosDeBloco = await prisma.financeOrcamento.findMany({
      where: { tenantId: tenant.id, alvoTipo: "BLOCO" },
    });
    let orcamentosMigrados = 0;
    for (const o of orcamentosDeBloco) {
      const nomeBloco = MAPA_CHAVE_ANTIGA_PARA_BLOCO[o.alvoChave];
      if (!nomeBloco) {
        console.warn(`  Orçamento ${o.id}: alvoChave "${o.alvoChave}" não é uma chave de bloco antiga conhecida — pulando (já deve ter sido migrado antes).`);
        continue;
      }
      const blocoId = blocoIdPorNome.get(nomeBloco);
      if (!blocoId) throw new Error(`Bloco "${nomeBloco}" não encontrado pro tenant "${tenant.slug}" (orçamento ${o.id}).`);
      await prisma.financeOrcamento.update({ where: { id: o.id }, data: { alvoChave: blocoId } });
      orcamentosMigrados++;
    }
    console.log(`${orcamentosMigrados} orçamento(s) por bloco migrado(s).`);

    // Confere que não sobrou nenhuma categoria sem blocoId antes de mexer no
    // schema — via SQL cru, não dá pra usar o client tipado aqui: o schema
    // novo já declara blocoId como obrigatório, então o Prisma recusa em
    // runtime qualquer filtro "blocoId: null" mesmo com cast de TS por cima
    // (erro visto na 1ª tentativa: "Argument `blocoId` must not be null").
    const semBlocoRows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) as count FROM "FinanceCategoria" WHERE "tenantId" = $1 AND "blocoId" IS NULL`,
      tenant.id
    );
    const semBloco = Number(semBlocoRows[0]?.count ?? 0);
    if (semBloco > 0) {
      throw new Error(`Tenant "${tenant.slug}": ${semBloco} categoria(s) ainda sem blocoId — abortando ANTES de finalizar o schema. Investigue antes de rodar de novo.`);
    }
  }

  // 4. Finaliza o schema — só chega aqui se TODOS os tenants fecharam sem
  // categoria órfã (o throw acima interrompe o script inteiro antes disto).
  console.log("\nFinalizando schema (NOT NULL, FK, índice novo, drop da coluna antiga)...");
  await prisma.$executeRawUnsafe(`ALTER TABLE "FinanceCategoria" ALTER COLUMN "blocoId" SET NOT NULL`);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "FinanceCategoria" ADD CONSTRAINT "FinanceCategoria_blocoId_fkey" FOREIGN KEY ("blocoId") REFERENCES "FinanceBloco"("id") ON DELETE RESTRICT ON UPDATE CASCADE`
  );
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "FinanceCategoria_tenantId_bloco_idx"`);
  await prisma.$executeRawUnsafe(`CREATE INDEX "FinanceCategoria_tenantId_blocoId_idx" ON "FinanceCategoria"("tenantId", "blocoId")`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "FinanceCategoria" DROP COLUMN "bloco"`);
  console.log("Schema finalizado. Migração completa — rode `npx prisma generate` em seguida.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
