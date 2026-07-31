// Libera RECEPTION (Recepção) pro tenant bnbflex (TenantModule) e pras
// pessoas com papel MASTER, GERENTE ou ATENDIMENTO (UserModuleAccess) —
// mesmo grupo do módulo Avaliações (ver comentário em
// grant-booking-reviews-access.ts), já que reserva é informação de
// front-desk/gestão, não de operação (Governança/Manutenção).
//
// Usa $executeRawUnsafe em vez de prisma.tenantModule.upsert/
// prisma.userModuleAccess.upsert pelo mesmo motivo do resto desta família
// de scripts (ver grant-estoque-access.ts): evita quebrar se o client
// Prisma gerado localmente ainda não conhece o valor novo do enum
// SuiteModule no momento de rodar.
//
//   npx tsx scripts/grant-recepcao-access.ts

import { prisma } from "../src/prisma";

const TENANT_SLUG = "bnbflex";
const ALLOWED_ROLES = ["MASTER", "GERENTE", "ATENDIMENTO"];

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: TENANT_SLUG } });

  await prisma.$executeRawUnsafe(
    `INSERT INTO "TenantModule" (id, "tenantId", module, enabled, "createdAt", "updatedAt")
     VALUES ('crcp' || substr(md5(random()::text), 1, 20), $1, 'RECEPTION'::"SuiteModule", true, now(), now())
     ON CONFLICT ("tenantId", module) DO UPDATE SET enabled = true, "updatedAt" = now()`,
    tenant.id
  );
  console.log(`TenantModule RECEPTION habilitado para "${tenant.slug}" (id: ${tenant.id}).\n`);

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
    await prisma.$executeRawUnsafe(
      `INSERT INTO "UserModuleAccess" (id, "userId", module, enabled, "createdAt", "updatedAt")
       VALUES ('crcp' || substr(md5(random()::text), 1, 20), $1, 'RECEPTION'::"SuiteModule", true, now(), now())
       ON CONFLICT ("userId", module) DO UPDATE SET enabled = true, "updatedAt" = now()`,
      u.id
    );
    console.log(`${u.nome.padEnd(20)} (${u.role}) — Recepção liberada`);
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
