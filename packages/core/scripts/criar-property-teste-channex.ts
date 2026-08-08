// Cria a Property + UH de teste usadas pra validar a conexão real com a
// Channex (ver praxis-pms-channel-manager-plano.md) sem tocar em nenhum
// dado do Bnb Flex Premium — pedido do Felipe, 08/08/2026, ao testar a
// integração com um anúncio real da própria casa dele ("Casa Felipe"),
// hospedado numa conta Airbnb separada (nome da mãe dele) só pra esse
// teste, já que a conta principal já tem a Stays como app de PMS.
//
// Fica no mesmo tenant "bnbflex" (não cria tenant novo) porque isso é só
// uma questão de licenciamento de módulo/usuário — o isolamento real do
// teste é a nível de Property/UH, que é justamente o motivo de
// ChannexPropertyMapping ter virado @unique por propertyId (não por
// tenantId) em 31/07/2026 (ver comentário no topo de mapear-channex.ts).
//
// UH criada com status "DISPONIVEL" de propósito: essa UH não passa pelo
// fluxo de Governança (Camareira/Inspeção) do hotel de verdade, então não
// faz sentido nascer "OCUPADO" (default do model).
//
// Uso: npx tsx scripts/criar-property-teste-channex.ts
import { prisma } from "../src/prisma";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "bnbflex" } });
  if (!tenant) throw new Error('Tenant "bnbflex" não encontrado.');

  const property = await prisma.property.create({
    data: { tenantId: tenant.id, nome: "Casa Felipe (Teste Channex)" },
  });
  console.log("Property criada:", property.id, "-", property.nome);

  const uh = await prisma.uH.create({
    data: {
      tenantId: tenant.id,
      propertyId: property.id,
      numero: "Casa Felipe",
      tipo: "Casa Inteira",
      status: "DISPONIVEL",
    },
  });
  console.log("UH criada:", uh.id, "-", uh.numero);

  console.log("\nPróximo passo (mapear-channex.ts):");
  console.log(
    `  npx tsx scripts/mapear-channex.ts --tenant-slug bnbflex --property-id ${property.id} --channex-property-id <uuid> --room-uh <channexRoomTypeId>=${uh.id}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
