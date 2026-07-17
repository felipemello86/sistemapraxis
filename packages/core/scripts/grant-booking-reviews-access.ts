// Libera BOOKING_REVIEWS pro tenant bnbflex (TenantModule) e pras pessoas
// com papel MASTER, GERENTE ou ATENDIMENTO (UserModuleAccess) — decisão
// explícita do Felipe: diferente da Governança (liberada pra todos), aqui só
// quem já lida com o fluxo de tratativa (Master/Gerente) ou é avaliada nele
// (Atendimento) recebe acesso, já que o Kanban expõe avaliação de
// desempenho individual. Outros cargos (Governanta, Camareira, Lavanderia,
// Manutenção) ficam de fora até decisão em contrário.
//
//   npx tsx scripts/grant-booking-reviews-access.ts

import { prisma } from "../src/prisma";

const TENANT_SLUG = "bnbflex";
const ALLOWED_ROLES = ["MASTER", "GERENTE", "ATENDIMENTO"];

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: TENANT_SLUG } });

  await prisma.tenantModule.upsert({
    where: { tenantId_module: { tenantId: tenant.id, module: "BOOKING_REVIEWS" } },
    update: { enabled: true },
    create: { tenantId: tenant.id, module: "BOOKING_REVIEWS", enabled: true },
  });
  console.log(`TenantModule BOOKING_REVIEWS habilitado para "${tenant.slug}" (id: ${tenant.id}).\n`);

  const usuarios = await prisma.user.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, nome: true, role: true },
  });

  let liberados = 0;
  for (const u of usuarios) {
    if (!ALLOWED_ROLES.includes(u.role)) {
      console.log(`${u.nome.padEnd(20)} (${u.role}) — sem acesso (cargo fora da lista)`);
      continue;
    }
    await prisma.userModuleAccess.upsert({
      where: { userId_module: { userId: u.id, module: "BOOKING_REVIEWS" } },
      update: { enabled: true },
      create: { userId: u.id, module: "BOOKING_REVIEWS", enabled: true },
    });
    console.log(`${u.nome.padEnd(20)} (${u.role}) — Avaliações liberada`);
    liberados++;
  }

  console.log(`\n${liberados} de ${usuarios.length} pessoas receberam acesso.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
