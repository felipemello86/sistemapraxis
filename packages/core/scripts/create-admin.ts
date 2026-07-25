// Cria (ou atualiza a senha de) um PlatformAdmin — staff da própria Praxis,
// com acesso ao painel /admin. Independente de qualquer tenant.
//
// Uso:
//   npx tsx scripts/create-admin.ts --nome "Felipe Mello" --email felipe_mello86@hotmail.com --senha "SenhaTemp123"

import bcrypt from "bcryptjs";
import { prisma } from "../src/prisma";

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const nome = getArg("nome");
  const email = getArg("email")?.trim().toLowerCase();
  const senha = getArg("senha");

  if (!nome || !email || !senha) {
    console.error(
      'Uso: npx tsx scripts/create-admin.ts --nome "Nome" --email admin@praxis.com --senha SenhaTemp123'
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(senha, 10);

  const admin = await prisma.platformAdmin.upsert({
    where: { email },
    update: { nome, passwordHash, ativo: true },
    create: { nome, email, passwordHash },
  });

  console.log("PlatformAdmin pronto:", admin.email, "-", admin.id);
  console.log("Acesso: https://sistemaspraxis.com.br/admin/login");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
