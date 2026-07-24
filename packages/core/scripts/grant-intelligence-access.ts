// Habilita o módulo INTELLIGENCE (Central de Inteligência) pro tenant
// bnbflex e libera acesso individual pra todo mundo — diferente dos outros
// módulos, este não tem um script de import de dados que já cria o
// TenantModule antes, então este script cuida das DUAS camadas do gate
// (TenantModule + UserModuleAccess) de uma vez.
//
//   npx tsx scripts/grant-intelligence-access.ts

import { prisma } from "../src/prisma";

const TENANT_SLUG = "bnbflex";

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: TENANT_SLUG } });

  await prisma.tenantModule.upsert({
    where: { tenantId_module: { tenantId: tenant.id, module: "INTELLIGENCE" } },
    update: { enabled: true },
    create: { tenantId: tenant.id, module: "INTELLIGENCE", enabled: true },
  });
  console.log(`Módulo INTELLIGENCE habilitado pro tenant ${TENANT_SLUG}.`);

  const usuarios = await prisma.user.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, nome: true, role: true },
  });

  for (const u of usuarios) {
    await prisma.userModuleAccess.upsert({
      where: { userId_module: { userId: u.id, module: "INTELLIGENCE" } },
      update: { enabled: true },
      create: { userId: u.id, module: "INTELLIGENCE", enabled: true },
    });
    console.log(`${u.nome.padEnd(20)} (${u.role}) — Central de Inteligência liberada`);
  }

  console.log(`\n${usuarios.length} pessoas atualizadas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
