// Habilita o módulo Financeiro (TenantModule FINANCE) e libera o acesso
// individual (UserModuleAccess) SÓ pro Felipe, no tenant bnbflex — pedido
// explícito dele, 05/08/2026 ("Só pra você por enquanto"). Diferente de
// grant-housekeeping-access.ts (libera todo mundo do tenant): aqui é
// hardcoded pro e-mail do Felipe de propósito, porque o módulo ainda nasce
// como uso pessoal dele, não do hotel/equipe. Quando isso mudar, trocar
// por um script tipo grant-finance-access.ts com ALLOWED_ROLES, no mesmo
// padrão dos demais módulos.
//
// Também já semeia a taxonomia de categorias padrão (ver
// seed-finance-categorias.ts) — sem isso a tela de DRE nasceria vazia.
//
//   npx tsx scripts/enable-finance-module.ts

import { prisma } from "../src/prisma";
import { DEFAULT_FINANCE_CATEGORIAS } from "../src/finance/categoria-defaults";

const TENANT_SLUG = "bnbflex";
const FELIPE_EMAIL = "felipe_mello86@hotmail.com";

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: TENANT_SLUG } });

  await prisma.tenantModule.upsert({
    where: { tenantId_module: { tenantId: tenant.id, module: "FINANCE" } },
    update: { enabled: true },
    create: { tenantId: tenant.id, module: "FINANCE", enabled: true },
  });
  console.log(`TenantModule FINANCE habilitado para "${tenant.slug}" (id: ${tenant.id}).`);

  const felipe = await prisma.user.findFirst({ where: { tenantId: tenant.id, email: FELIPE_EMAIL } });
  if (!felipe) {
    console.warn(
      `Aviso: nenhum usuário com e-mail "${FELIPE_EMAIL}" encontrado no tenant "${tenant.slug}" — TenantModule ficou habilitado, mas ninguém tem UserModuleAccess ainda. Rode de novo depois que o usuário existir, ou libere manualmente em Configurações > Usuários.`
    );
  } else {
    await prisma.userModuleAccess.upsert({
      where: { userId_module: { userId: felipe.id, module: "FINANCE" } },
      update: { enabled: true },
      create: { userId: felipe.id, module: "FINANCE", enabled: true },
    });
    console.log(`UserModuleAccess FINANCE liberado para ${felipe.nome} (${felipe.email}).`);
  }

  const jaTemCategorias = await prisma.financeCategoria.count({ where: { tenantId: tenant.id } });
  if (jaTemCategorias > 0) {
    console.log(`Tenant já tem ${jaTemCategorias} categoria(s) financeira(s) — seed de categorias pulado.`);
  } else {
    for (const cat of DEFAULT_FINANCE_CATEGORIAS) {
      await prisma.financeCategoria.create({
        data: { tenantId: tenant.id, nome: cat.nome, tipo: cat.tipo, bloco: cat.bloco, ordem: cat.ordem },
      });
    }
    console.log(`${DEFAULT_FINANCE_CATEGORIAS.length} categorias financeiras criadas (ver categoria-defaults.ts).`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
