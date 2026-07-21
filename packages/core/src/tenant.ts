import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { SuiteModule } from "../generated";
import { DEFAULT_MAINTENANCE_ITEMS } from "./maintenance-defaults";

// Ponto único de criação de cliente (tenant) + usuário MASTER inicial.
//
// Hoje é chamado só pelo script de linha de comando (scripts/create-tenant.ts).
// A visão de longo prazo é onboarding self-service (cliente assina, cria
// conta, passa por um setup guiado) — quando isso for construído, a rota de
// signup deve chamar esta MESMA função em vez de reimplementar a lógica.
// Não duplicar isso em outro lugar.

export interface CreateTenantInput {
  nome: string;
  slug: string;
  email: string;
  senha: string;
  nomeUsuario?: string;
  // Módulos de negócio a habilitar de saída pro tenant e pro usuário MASTER.
  // Nesta fundação (v2) ainda não existe nenhum módulo portado, então o
  // padrão é lista vazia — passar explicitamente quando os módulos existirem.
  modules?: SuiteModule[];
}

export interface CreateTenantResult {
  tenantId: string;
  userId: string;
}

export async function createTenant(input: CreateTenantInput): Promise<CreateTenantResult> {
  const { nome, slug, email, senha, nomeUsuario, modules = [] } = input;

  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: {},
    create: { slug, name: nome },
  });

  for (const module of modules) {
    await prisma.tenantModule.upsert({
      where: { tenantId_module: { tenantId: tenant.id, module } },
      update: { enabled: true },
      create: { tenantId: tenant.id, module, enabled: true },
    });
  }

  // Seed de dados padrão por módulo — hoje só a Manutenção tem catálogo
  // inicial (checklist de 40 itens, ver maintenance-defaults.ts). Só roda se
  // o tenant ainda não tiver nenhum item (evita duplicar em upserts repetidos
  // do script de criação, ex. rodando de novo pra atualizar o usuário).
  if (modules.includes("MAINTENANCE")) {
    const jaTemItens = await prisma.maintenanceChecklistItem.count({
      where: { tenantId: tenant.id },
    });
    if (jaTemItens === 0) {
      await prisma.maintenanceChecklistItem.createMany({
        data: DEFAULT_MAINTENANCE_ITEMS.map((it) => ({
          tenantId: tenant.id,
          name: it.name,
          category: it.category,
          subDescription: it.subDescription,
        })),
      });
    }
  }

  const passwordHash = await bcrypt.hash(senha, 10);

  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email } },
    update: {},
    create: {
      tenantId: tenant.id,
      nome: nomeUsuario ?? nome,
      email,
      passwordHash,
      role: "MASTER",
    },
  });

  for (const module of modules) {
    await prisma.userModuleAccess.upsert({
      where: { userId_module: { userId: user.id, module } },
      update: { enabled: true },
      create: { userId: user.id, module, enabled: true },
    });
  }

  return { tenantId: tenant.id, userId: user.id };
}
