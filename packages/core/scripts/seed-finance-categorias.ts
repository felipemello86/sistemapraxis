// Semeia o catálogo padrão de blocos + categorias financeiras (ver
// src/finance/categoria-defaults.ts) pra um tenant — pedido do Felipe,
// 05/08/2026, taxonomia extraída da planilha "DRE Julho 2026.xlsx" dele.
// Desde a introdução dos blocos configuráveis (mesma data), isto é só o
// PONTO DE PARTIDA: depois de semeado, o tenant edita livremente em
// Configurações — rodar este script de novo nunca desfaz customização feita
// lá (só cria o que ainda não existe, por nome; não sobrescreve tipo/bloco
// de quem já foi editado manualmente).
//
// Idempotente: usa upsert por [tenantId, nome] (mesmo unique do schema), então
// rodar de novo não duplica nada.
//
// Uso:
//   npx tsx scripts/seed-finance-categorias.ts --slug bnbflex

import { prisma } from "../src/prisma";
import { DEFAULT_FINANCE_BLOCOS, DEFAULT_FINANCE_CATEGORIAS } from "../src/finance/categoria-defaults";

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const slug = getArg("slug");
  if (!slug) {
    console.error("Uso: npx tsx scripts/seed-finance-categorias.ts --slug slugdocliente");
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug } });

  const blocoIdPorNome = new Map<string, string>();
  let blocosCriados = 0;
  for (const b of DEFAULT_FINANCE_BLOCOS) {
    const bloco = await prisma.financeBloco.upsert({
      where: { tenantId_nome: { tenantId: tenant.id, nome: b.nome } },
      update: {},
      create: { tenantId: tenant.id, nome: b.nome, ordem: b.ordem, totalizador: b.totalizador, sinal: b.sinal },
    });
    if (bloco.createdAt.getTime() === bloco.updatedAt.getTime()) blocosCriados++;
    blocoIdPorNome.set(b.nome, bloco.id);
  }

  let criadas = 0;
  let jaExistiam = 0;

  for (const cat of DEFAULT_FINANCE_CATEGORIAS) {
    const blocoId = blocoIdPorNome.get(cat.blocoNome);
    if (!blocoId) throw new Error(`Bloco "${cat.blocoNome}" não encontrado (categoria "${cat.nome}") — confira DEFAULT_FINANCE_BLOCOS.`);

    const existente = await prisma.financeCategoria.findUnique({ where: { tenantId_nome: { tenantId: tenant.id, nome: cat.nome } } });
    if (existente) {
      jaExistiam++;
      continue;
    }
    await prisma.financeCategoria.create({
      data: { tenantId: tenant.id, nome: cat.nome, tipo: cat.tipo, blocoId, ordem: cat.ordem },
    });
    criadas++;
  }

  console.log(
    `Tenant "${tenant.slug}": ${blocosCriados} bloco(s) criado(s), ${criadas} categoria(s) criada(s), ${jaExistiam} já existiam (total no catálogo: ${DEFAULT_FINANCE_CATEGORIAS.length}).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
