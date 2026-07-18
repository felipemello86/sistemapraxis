// Libera STOCK (Estoque) pro tenant bnbflex (TenantModule) e pras pessoas
// com papel MASTER, GERENTE ou GOVERNANTA (UserModuleAccess) — decisão
// explícita do Felipe: diferente da Governança (liberada pra todos) e de
// Avaliações (Master/Gerente/Atendimento), aqui só quem gerencia insumos no
// dia a dia recebe acesso. Atendimento fica de fora de propósito (mesma
// decisão explícita, ver PR do módulo Estoque).
//
// Usa $executeRawUnsafe em vez de prisma.tenantModule.upsert/
// prisma.userModuleAccess.upsert porque o client gerado neste ambiente
// ainda não conhece o valor STOCK do enum SuiteModule (schema mudou depois
// do último `prisma generate` bem-sucedido — rodar `npx prisma generate`
// localmente resolve e este script pode voltar a usar os métodos tipados
// no futuro).
//
//   npx tsx scripts/grant-estoque-access.ts

import { prisma } from "../src/prisma";

const TENANT_SLUG = "bnbflex";
const ALLOWED_ROLES = ["MASTER", "GERENTE", "GOVERNANTA"];

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: TENANT_SLUG } });

  await prisma.$executeRawUnsafe(
    `INSERT INTO "TenantModule" (id, "tenantId", module, enabled, "createdAt", "updatedAt")
     VALUES ('cstk' || substr(md5(random()::text), 1, 20), $1, 'STOCK'::"SuiteModule", true, now(), now())
     ON CONFLICT ("tenantId", module) DO UPDATE SET enabled = true, "updatedAt" = now()`,
    tenant.id
  );
  console.log(`TenantModule STOCK habilitado para "${tenant.slug}" (id: ${tenant.id}).\n`);

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
       VALUES ('cstk' || substr(md5(random()::text), 1, 20), $1, 'STOCK'::"SuiteModule", true, now(), now())
       ON CONFLICT ("userId", module) DO UPDATE SET enabled = true, "updatedAt" = now()`,
      u.id
    );
    console.log(`${u.nome.padEnd(20)} (${u.role}) — Estoque liberado`);
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
