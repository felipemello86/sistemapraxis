// Semeia o catálogo padrão de categorias financeiras (ver
// src/finance/categoria-defaults.ts) pra um tenant — pedido do Felipe,
// 05/08/2026, taxonomia extraída da planilha "DRE Julho 2026.xlsx" dele.
//
// Idempotente: usa upsert por [tenantId, nome] (mesmo unique do schema), então
// rodar de novo não duplica nada e atualiza bloco/ordem se algo mudar aqui.
//
// Uso:
//   npx tsx scripts/seed-finance-categorias.ts --slug bnbflex

import { prisma } from "../src/prisma";
import { DEFAULT_FINANCE_CATEGORIAS } from "../src/finance/categoria-defaults";

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

  let criadas = 0;
  let atualizadas = 0;

  for (const cat of DEFAULT_FINANCE_CATEGORIAS) {
    const resultado = await prisma.financeCategoria.upsert({
      where: { tenantId_nome: { tenantId: tenant.id, nome: cat.nome } },
      update: { tipo: cat.tipo, bloco: cat.bloco, ordem: cat.ordem },
      create: {
        tenantId: tenant.id,
        nome: cat.nome,
        tipo: cat.tipo,
        bloco: cat.bloco,
        ordem: cat.ordem,
      },
    });
    // upsert não distingue create/update no retorno — comparamos createdAt/updatedAt
    if (resultado.createdAt.getTime() === resultado.updatedAt.getTime()) {
      criadas++;
    } else {
      atualizadas++;
    }
  }

  console.log(
    `Tenant "${tenant.slug}": ${criadas} categoria(s) criada(s), ${atualizadas} atualizada(s) (total no catálogo: ${DEFAULT_FINANCE_CATEGORIAS.length}).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
