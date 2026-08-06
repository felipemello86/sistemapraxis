// Cria um usuário de teste no tenant bnbflex, só pra dar pro analista da
// Meta (App Review do WhatsApp Embedded Signup, 06/08/2026) — assim ele
// consegue logar sozinho e ver o módulo Vendas → Canais sem precisar da
// conta pessoal do Felipe. Role GERENTE (já está na ALLOWED_ROLES de
// grant-vendas-access.ts, então tem acesso ao módulo SALES automaticamente
// — mas fazemos o upsert de UserModuleAccess aqui mesmo, sem depender de
// rodar aquele script de novo).
//
//   npx tsx scripts/create-meta-review-user.ts

import bcrypt from "bcryptjs";
import { prisma } from "../src/prisma";

const TENANT_SLUG = "bnbflex";
const EMAIL = "meta-review@bnbflex.com.br";
const SENHA = "MetaReview2026!";
const NOME = "Meta App Review";

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: TENANT_SLUG } });
  const passwordHash = await bcrypt.hash(SENHA, 10);

  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: EMAIL } },
    update: { passwordHash, ativo: true, role: "GERENTE", nome: NOME },
    create: {
      tenantId: tenant.id,
      nome: NOME,
      email: EMAIL,
      passwordHash,
      role: "GERENTE",
      ativo: true,
    },
  });

  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserModuleAccess" (id, "userId", module, enabled, "createdAt", "updatedAt")
     VALUES ('crcp' || substr(md5(random()::text), 1, 20), $1, 'SALES'::"SuiteModule", true, now(), now())
     ON CONFLICT ("userId", module) DO UPDATE SET enabled = true, "updatedAt" = now()`,
    user.id
  );

  console.log(`Usuário de teste criado/atualizado:`);
  console.log(`  Tenant: ${tenant.slug} (${tenant.id})`);
  console.log(`  Login:  ${EMAIL}`);
  console.log(`  Senha:  ${SENHA}`);
  console.log(`  Acesso ao módulo Vendas: liberado.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
