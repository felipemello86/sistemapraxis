// Libera MAINTENANCE pro tenant bnbflex (TenantModule) e pra todo mundo do
// tenant (UserModuleAccess) — mesma decisão já tomada pra Governança
// (liberada pra todos): diferente de Avaliações, a tela de Manutenção não
// expõe avaliação de desempenho individual, só operação (checklist de
// inspeção por UH), então não há motivo pra restringir por cargo.
//
//   npx tsx scripts/grant-maintenance-access.ts

import { prisma } from "../src/prisma";

const TENANT_SLUG = "bnbflex";

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: TENANT_SLUG } });

  await prisma.tenantModule.upsert({
    where: { tenantId_module: { tenantId: tenant.id, module: "MAINTENANCE" } },
    update: { enabled: true },
    create: { tenantId: tenant.id, module: "MAINTENANCE", enabled: true },
  });
  console.log(`TenantModule MAINTENANCE habilitado para "${tenant.slug}" (id: ${tenant.id}).\n`);

  const usuarios = await prisma.user.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, nome: true, role: true },
  });

  for (const u of usuarios) {
    await prisma.userModuleAccess.upsert({
      where: { userId_module: { userId: u.id, module: "MAINTENANCE" } },
      update: { enabled: true },
      create: { userId: u.id, module: "MAINTENANCE", enabled: true },
    });
    console.log(`${u.nome.padEnd(20)} (${u.role}) — Manutenção liberada`);
  }

  console.log(`\n${usuarios.length} pessoas receberam acesso.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
