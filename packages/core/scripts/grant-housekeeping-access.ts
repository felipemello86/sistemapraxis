// Libera UserModuleAccess(HOUSEKEEPING) pra TODO MUNDO do tenant bnbflex,
// independente de cargo (decisão explícita do Felipe: "libere para todos").
// O TenantModule já está habilitado (via import-housekeeping-data.ts), mas
// faltava a segunda camada do gate (acesso individual), que normalmente
// fica a cargo da tela Configurações > Usuários — aqui é o carimbo em lote
// pra destravar todo mundo de uma vez, sem impedir que depois alguém tire
// o acesso manualmente na UI se fizer sentido.
//
//   npx tsx scripts/grant-housekeeping-access.ts

import { prisma } from "../src/prisma";

const TENANT_SLUG = "bnbflex";

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: TENANT_SLUG } });

  const usuarios = await prisma.user.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, nome: true, role: true },
  });

  for (const u of usuarios) {
    await prisma.userModuleAccess.upsert({
      where: { userId_module: { userId: u.id, module: "HOUSEKEEPING" } },
      update: { enabled: true },
      create: { userId: u.id, module: "HOUSEKEEPING", enabled: true },
    });
    console.log(`${u.nome.padEnd(20)} (${u.role}) — Governança liberada`);
  }

  console.log(`\n${usuarios.length} pessoas atualizadas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
