// Habilita o módulo Housekeeping (TenantModule) pra QUALQUER tenant (não só
// bnbflex, diferente dos outros scripts grant-*-access.ts) e já semeia os 4
// programas de limpeza padrão (ver housekeeping-defaults.ts) — pedido do
// Felipe, 04/08/2026: "criar automaticamente os programas ao ativar o
// módulo Housekeeping pra um tenant".
//
// Complementa createTenant() (src/tenant.ts), que já faz esse mesmo seed
// quando HOUSEKEEPING é passado em `modules` na criação — mas hoje nenhum
// tenant é criado assim na prática (create-tenant.ts nunca passa `modules`,
// módulos são ligados depois, um por um, com scripts como este). Este
// script cobre esse caminho real: ligar Housekeeping pra um tenant já
// existente, com ou sem módulo antes.
//
// Idempotente: só cria os programas se o tenant ainda não tiver nenhum
// (mesmo guard usado em tenant.ts), então rodar de novo não duplica nada.
//
// Uso:
//   npx tsx scripts/enable-housekeeping-module.ts --slug hotelexemplo

import { prisma } from "../src/prisma";
import { DEFAULT_CLEANING_PROGRAMS } from "../src/housekeeping-defaults";

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const slug = getArg("slug");
  if (!slug) {
    console.error("Uso: npx tsx scripts/enable-housekeeping-module.ts --slug slugdocliente");
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug } });

  await prisma.tenantModule.upsert({
    where: { tenantId_module: { tenantId: tenant.id, module: "HOUSEKEEPING" } },
    update: { enabled: true },
    create: { tenantId: tenant.id, module: "HOUSEKEEPING", enabled: true },
  });
  console.log(`TenantModule HOUSEKEEPING habilitado para "${tenant.slug}" (id: ${tenant.id}).`);

  const jaTemProgramas = await prisma.cleaningProgram.count({ where: { tenantId: tenant.id } });
  if (jaTemProgramas > 0) {
    console.log(`Tenant já tem ${jaTemProgramas} programa(s) de limpeza — nada semeado.`);
  } else {
    for (const programa of DEFAULT_CLEANING_PROGRAMS) {
      await prisma.cleaningProgram.create({
        data: {
          tenantId: tenant.id,
          nome: programa.nome,
          tipo: programa.tipo,
          steps: { create: programa.steps },
        },
      });
      console.log(`  + ${programa.nome} (${programa.tipo})`);
    }
    console.log(`${DEFAULT_CLEANING_PROGRAMS.length} programas de limpeza criados.`);
  }

  console.log(
    "\nLembrete: acesso por usuário (UserModuleAccess) continua separado — libere em Configurações > Usuários, ou com um script tipo grant-housekeeping-access.ts."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
