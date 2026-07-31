// Script manual pra ligar um tenant do Praxis a uma property da Channex, e
// os room types dela a UHs do Praxis (ver ChannexPropertyMapping/
// ChannexRoomMapping no schema.prisma, e Fase 1 do plano de channel
// manager: praxis-pms-channel-manager-plano.md). Não existe tela pra isso
// ainda — é MVP, roda uma vez por hotel-piloto até que uma UI de
// configuração real seja construída.
//
// Duas formas de mapear um room type, dependendo de como a property foi
// desenhada na Channex:
//
//   --room <channexRoomTypeId>=<uhTipo>
//     Room type é uma CATEGORIA (várias UHs intercambiáveis, ex.: vários
//     quartos "Standard"). A reserva chega marcada com esse tipo, sem UH
//     específica — a alocação fica pra recepção (Fase 4).
//
//   --room-uh <channexRoomTypeId>=<uhId>
//     Room type já representa 1 UH física específica (Count Of Rooms = 1
//     na Channex, comum quando cada anúncio tem nome/vista própria — foi
//     o caso encontrado na Bnb Flex Premium: "Loft com Vista pro Mar" etc.
//     mapeando cada um pra uma UH real, ex. "204-D"). A reserva já chega
//     pré-alocada. O uhTipo é preenchido sozinho a partir do UH.tipo real.
//
// Uso:
//   npx tsx scripts/mapear-channex.ts \
//     --tenant-slug bnbflex \
//     --channex-property-id 716305c4-561a-4561-a187-7f5b8aeb5920 \
//     --room-uh 994d1375-dbbd-4072-8724-b2ab32ce781b=cmrnwnovl0005a1y53s7kn1zm \
//     --room a07e712e-cb34-4ec9-b085-63e59a88c249=Suite
//
// Os UUIDs de property/room type vem do dashboard da Channex (Properties >
// [sua property] > Rooms & Rates). O uhId vem do banco do Praxis (id da UH,
// não o número/nome dela).
import { prisma } from "../src/prisma";

function parseArgs() {
  const args = process.argv.slice(2);
  const out: {
    tenantSlug?: string;
    channexPropertyId?: string;
    roomsPorTipo: Array<{ id: string; tipo: string }>;
    roomsPorUh: Array<{ id: string; uhId: string }>;
  } = { roomsPorTipo: [], roomsPorUh: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tenant-slug") out.tenantSlug = args[++i];
    else if (args[i] === "--channex-property-id") out.channexPropertyId = args[++i];
    else if (args[i] === "--room") {
      const raw = args[++i];
      const [id, tipo] = (raw || "").split("=");
      if (!id || !tipo) throw new Error(`--room mal formado: "${raw}" (esperado ID=TIPO)`);
      out.roomsPorTipo.push({ id, tipo });
    } else if (args[i] === "--room-uh") {
      const raw = args[++i];
      const [id, uhId] = (raw || "").split("=");
      if (!id || !uhId) throw new Error(`--room-uh mal formado: "${raw}" (esperado ID=UH_ID)`);
      out.roomsPorUh.push({ id, uhId });
    }
  }
  return out;
}

async function main() {
  const { tenantSlug, channexPropertyId, roomsPorTipo, roomsPorUh } = parseArgs();
  if (!tenantSlug || !channexPropertyId) {
    console.error(
      "Uso: npx tsx scripts/mapear-channex.ts --tenant-slug <slug> --channex-property-id <uuid> [--room <channexRoomTypeId>=<uhTipo> ...] [--room-uh <channexRoomTypeId>=<uhId> ...]"
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

  for (const room of roomsPorTipo) {
    await prisma.channexRoomMapping.upsert({
      where: { channexRoomTypeId: room.id },
      update: { tenantId: tenant.id, uhTipo: room.tipo, uhId: null },
      create: { tenantId: tenant.id, channexRoomTypeId: room.id, uhTipo: room.tipo },
    });
    console.log(`Room type mapeado (por tipo): ${room.id} <-> UH.tipo "${room.tipo}"`);
  }

  for (const room of roomsPorUh) {
    const uh = await prisma.uH.findUnique({ where: { id: room.uhId } });
    if (!uh || uh.tenantId !== tenant.id) {
      throw new Error(`UH "${room.uhId}" não encontrada (ou não pertence ao tenant "${tenantSlug}").`);
    }
    await prisma.channexRoomMapping.upsert({
      where: { channexRoomTypeId: room.id },
      update: { tenantId: tenant.id, uhTipo: uh.tipo, uhId: uh.id },
      create: { tenantId: tenant.id, channexRoomTypeId: room.id, uhTipo: uh.tipo, uhId: uh.id },
    });
    console.log(`Room type mapeado (por UH): ${room.id} <-> UH "${uh.numero}" (${uh.id})`);
  }

  const total = roomsPorTipo.length + roomsPorUh.length;
  console.log("Pronto:", propertyMapping.id, `(${total} room type(s) mapeado(s))`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
