// Segunda passada do backfill de Property, resolvendo os 6 casos que o
// backfill-properties.ts não conseguiu casar por sufixo — decisão do Felipe:
//   - 101, 103, 104, 105, 202: não existem de verdade (erro de sistema) →
//     desativa (ativo=false) em vez de apagar, preserva histórico ligado.
//   - 1406 (sem sufixo, diferente de 1406-D que já foi associada): é da
//     Bnb Flex Premium também.
//
//   npx tsx scripts/fix-uh-property-gaps.ts

import { prisma } from "../src/prisma";

const TENANT_SLUG = "bnbflex";
const PHANTOM_NUMEROS = ["101", "103", "104", "105", "202"];
const PREMIUM_NUMERO_SEM_SUFIXO = "1406";

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: TENANT_SLUG } });

  const premium = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM "Property" WHERE "tenantId" = $1 AND nome = $2`,
    tenant.id,
    "Bnb Flex Premium"
  );
  if (!premium[0]) throw new Error("Property Bnb Flex Premium não encontrada — rode backfill-properties.ts antes.");

  const uh1406 = await prisma.uH.findFirst({
    where: { tenantId: tenant.id, numero: PREMIUM_NUMERO_SEM_SUFIXO },
  });
  if (uh1406) {
    await prisma.$executeRawUnsafe(`UPDATE "UH" SET "propertyId" = $1 WHERE id = $2`, premium[0].id, uh1406.id);
    console.log(`${uh1406.numero} → Bnb Flex Premium`);
  } else {
    console.log(`UH "${PREMIUM_NUMERO_SEM_SUFIXO}" não encontrada (já pode ter sido tratada).`);
  }

  for (const numero of PHANTOM_NUMEROS) {
    const uh = await prisma.uH.findFirst({ where: { tenantId: tenant.id, numero } });
    if (!uh) {
      console.log(`UH "${numero}" não encontrada (já pode ter sido tratada).`);
      continue;
    }
    await prisma.uH.update({ where: { id: uh.id }, data: { ativo: false } });
    console.log(`${numero} → desativada (ativo=false)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
