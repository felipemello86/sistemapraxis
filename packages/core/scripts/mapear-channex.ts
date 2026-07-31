// Script manual pra ligar um tenant do Praxis a uma property da Channex, e
// os room types dela aos tipos de UH do Praxis (ver ChannexPropertyMapping/
// ChannexRoomMapping no schema.prisma, e Fase 1 do plano de channel
// manager: praxis-pms-channel-manager-plano.md). Não existe tela pra isso
// ainda — é MVP, roda uma vez por hotel-piloto até que uma UI de
// configuração real seja construída.
//
// Uso:
//   npx tsx scripts/mapear-channex.ts \
//     --tenant-slug bnbflex \
//     --channex-property-id 716305c4-561a-4561-a187-7f5b8aeb5920 \
//     --room 994d1375-dbbd-4072-8724-b2ab32ce781b=Standard \
//     --room a07e712e-cb34-4ec9-b085-63e59a88c249=Suite
//
// Os UUIDs de property/room type vem do dashboard da Channex (Properties >
// [sua property] > Rooms & Rates). O valor depois do "=" em --room precisa
// bater exatamente (case-sensitive) com UH.tipo já usado no Praxis.
import { prisma } from "../src/prisma";

function parseArgs() {
  const args = process.argv.slice(2);
  const out: { tenantSlug?: string; channexPropertyId?: string; rooms: Array<{ id: string; tipo: string }> } = {
    rooms: [],
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tenant-slug") out.tenantSlug = args[++i];
    else if (args[i] === "--channex-property-id") out.channexPropertyId = args[++i];
    else if (args[i] === "--room") {
      const raw = args[++i];
      const [id, tipo] = (raw || "").split("=");
      if (!id || !tipo) throw new Error(`--room mal formado: "${raw}" (esperado ID=TIPO)`);
      out.rooms.push({ id, tipo });
    }
  }
  return out;
}

async function main() {
  const { tenantSlug, channexPropertyId, rooms } = parseArgs();
  if (!tenantSlug || !channexPropertyId) {
    console.error(
      "Uso: npx tsx scripts/mapear-channex.ts --tenant-slug <slug> --channex-property-id <uuid> [--room <channexRoomTypeId>=<uhTipo> ...]"
    );
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) throw new Error(`Tenant "${tenantSlug}" não encontrado.`);

  const propertyMapping = await prisma.channexPropertyMapping.upsert({
    where: { tenantId: tenant.id },
    update: { channexPropertyId },
    create: { tenantId: tenant.id, channexPropertyId },
  });
  console.log(`Property mapeada: tenant "${tenantSlug}" <-> Channex property ${channexPropertyId}`);

  for (const room of rooms) {
    await prisma.channexRoomMapping.upsert({
      where: { channexRoomTypeId: room.id },
      update: { tenantId: tenant.id, uhTipo: room.tipo },
      create: { tenantId: tenant.id, channexRoomTypeId: room.id, uhTipo: room.tipo },
    });
    console.log(`Room type mapeado: ${room.id} <-> UH.tipo "${room.tipo}"`);
  }

  console.log("Pronto:", propertyMapping.id, `(${rooms.length} room type(s) mapeado(s))`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
