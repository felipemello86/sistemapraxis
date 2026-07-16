// Cria UMA atribuição de teste pra hoje, pra testar a tela "Minhas UHs" de
// ponta a ponta. Diferente de import-housekeeping-data.ts (que traz dado
// REAL do v0 — UHs, programas, checklist), atribuição diária é dado
// operacional (muda toda hora, não é "referência"), então aqui é só um
// registro de teste — usando UH e programa REAIS (já importados), não
// inventados.
//
// Rodar DEPOIS de import-housekeeping-data.ts:
//   npx tsx scripts/seed-housekeeping-test.ts

import { format } from "date-fns";
import { prisma } from "../src/prisma";

const TENANT_SLUG = "bnbflex";
const CAMAREIRA_EMAIL = "vleandra049@gmail.com"; // Leandra Vitória
const UH_NUMERO = "602-V"; // UH real, sem manutenção pendente
const PROGRAMA_NOME = "Arrumação Padrão (25 min)";

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: TENANT_SLUG } });

  const camareira = await prisma.user.findUniqueOrThrow({
    where: { tenantId_email: { tenantId: tenant.id, email: CAMAREIRA_EMAIL } },
  });
  await prisma.userModuleAccess.upsert({
    where: { userId_module: { userId: camareira.id, module: "HOUSEKEEPING" } },
    update: { enabled: true },
    create: { userId: camareira.id, module: "HOUSEKEEPING", enabled: true },
  });

  const uh = await prisma.uH.findUniqueOrThrow({
    where: { tenantId_numero: { tenantId: tenant.id, numero: UH_NUMERO } },
  });
  const programa = await prisma.cleaningProgram.findFirstOrThrow({
    where: { tenantId: tenant.id, nome: PROGRAMA_NOME },
  });

  const hoje = format(new Date(), "yyyy-MM-dd");

  await prisma.dailyAssignment.upsert({
    where: { data_uhId: { data: hoje, uhId: uh.id } },
    update: { camareiraId: camareira.id, programId: programa.id, status: "LIBERADO" },
    create: {
      tenantId: tenant.id,
      data: hoje,
      uhId: uh.id,
      camareiraId: camareira.id,
      programId: programa.id,
      status: "LIBERADO",
      liberadaEm: new Date(),
      criadoPorNome: "Seed de teste",
    },
  });

  console.log(`Pronto. UH ${UH_NUMERO} atribuída pra ${camareira.nome} hoje (${hoje}), status LIBERADO.`);
  console.log(`Faça login como ${camareira.nome} (${camareira.email}) e acesse /camareira no app housekeeping.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
