// Cria as 3 Properties da bnbflex e associa cada UH existente por sufixo do
// número (-V Suites, -I Comfort, -D Premium — mapeamento confirmado pelo
// Felipe). Usa $queryRawUnsafe/$executeRawUnsafe em vez de prisma.property.*
// porque este script roda ANTES do `npx prisma generate` picking up o novo
// model Property (rodado manualmente pelo Felipe por causa do bug de sandbox
// já conhecido) — os models antigos (UH, Tenant) continuam funcionando
// normalmente via client tipado, só Property que ainda não existe no client
// gerado no momento em que este script roda.
//
//   npx tsx scripts/backfill-properties.ts

import { randomUUID } from "crypto";
import { prisma } from "../src/prisma";

const TENANT_SLUG = "bnbflex";

const SUFFIX_TO_PROPERTY: Record<string, string> = {
  V: "Bnb Flex Suites",
  I: "Bnb Flex Comfort",
  D: "Bnb Flex Premium",
};

function propertyNameForNumero(numero: string): string | null {
  const suffix = numero.trim().slice(-1).toUpperCase();
  return SUFFIX_TO_PROPERTY[suffix] ?? null;
}

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: TENANT_SLUG } });

  const propertyNames = Array.from(new Set(Object.values(SUFFIX_TO_PROPERTY)));
  const propertyIdByName = new Map<string, string>();

  for (const nome of propertyNames) {
    const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Property" WHERE "tenantId" = $1 AND nome = $2`,
      tenant.id,
      nome
    );
    if (existing[0]) {
      propertyIdByName.set(nome, existing[0].id);
      console.log(`Property já existia: ${nome} (${existing[0].id})`);
      continue;
    }
    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Property" (id, "tenantId", nome, "createdAt", "updatedAt") VALUES ($1, $2, $3, now(), now())`,
      id,
      tenant.id,
      nome
    );
    propertyIdByName.set(nome, id);
    console.log(`Property criada: ${nome} (${id})`);
  }

  const uhs = await prisma.uH.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, numero: true },
    orderBy: { numero: "asc" },
  });

  let associadas = 0;
  const semMatch: string[] = [];

  for (const uh of uhs) {
    const nome = propertyNameForNumero(uh.numero);
    if (!nome) {
      semMatch.push(uh.numero);
      continue;
    }
    const propertyId = propertyIdByName.get(nome)!;
    await prisma.$executeRawUnsafe(`UPDATE "UH" SET "propertyId" = $1 WHERE id = $2`, propertyId, uh.id);
    console.log(`${uh.numero.padEnd(10)} → ${nome}`);
    associadas++;
  }

  console.log(`\n${associadas} de ${uhs.length} UHs associadas.`);
  if (semMatch.length > 0) {
    console.log(`\nATENÇÃO — sem sufixo reconhecido (-V/-I/-D), não associadas: ${semMatch.join(", ")}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
