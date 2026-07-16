// Cria um cliente (tenant) novo + usuário MASTER inicial.
//
// Uso:
//   npx tsx scripts/create-tenant.ts --nome "Hotel Exemplo" --slug hotelexemplo --email dono@hotelexemplo.com --senha "SenhaTemp123"
//
// Nesta fundação (v2) ainda não existe nenhum módulo de negócio portado,
// então nenhum módulo é habilitado automaticamente — isso é esperado até
// Governança/Manutenção/Avaliações serem portados pra cá.
//
// Esta é hoje a única forma de criar um cliente novo. A lógica em si mora
// em src/tenant.ts (createTenant) — quando existir onboarding self-service,
// a rota de signup deve chamar a mesma função, não reimplementar isso.

import { createTenant } from "../src/tenant";
import { prisma } from "../src/prisma";

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const nome = getArg("nome");
  const slug = getArg("slug");
  const email = getArg("email");
  const senha = getArg("senha");

  if (!nome || !slug || !email || !senha) {
    console.error(
      'Uso: npx tsx scripts/create-tenant.ts --nome "Nome do Cliente" --slug slugdocliente --email dono@cliente.com --senha SenhaTemp123'
    );
    process.exit(1);
  }

  const result = await createTenant({ nome, slug, email, senha });

  console.log("Tenant criado:", slug, "-", result.tenantId);
  console.log("Usuário MASTER:", email, "-", result.userId);
  console.log(`\nAcesso: https://sistemaspraxis.com.br/${slug}`);
  console.log("Peça pra trocar a senha no primeiro login (tela Configurações).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
