// Seed de dados de teste (não roda em produção, só invocado manualmente):
//   npx tsx scripts/seed-test-tenant.ts
//
// Wrapper fino em cima de createTenant (src/tenant.ts) — mesma função usada
// pelo script genérico create-tenant.ts. Idempotente (upsert por slug/email).

import { createTenant } from "../src/tenant";
import { prisma } from "../src/prisma";

async function main() {
  const result = await createTenant({
    nome: "BNB Flex",
    slug: "bnbflex",
    email: "felipe_mello86@hotmail.com",
    nomeUsuario: "Felipe Mello",
    senha: "EFz2btMa72VS", // trocar depois do primeiro login (Configurações > Trocar senha)
  });

  console.log("Tenant:", "bnbflex", result.tenantId);
  console.log("Usuário MASTER:", "felipe_mello86@hotmail.com", result.userId);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
