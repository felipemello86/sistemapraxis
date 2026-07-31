// Script manual pra ligar uma Property do Praxis a uma property da Channex, e
// os room types dela a UHs do Praxis (ver ChannexPropertyMapping/
// ChannexRoomMapping no schema.prisma, e Fase 1 do plano de channel
// manager: praxis-pms-channel-manager-plano.md). Não existe tela pra isso
// ainda — é MVP, roda uma vez por property-piloto até que uma UI de
// configuração real seja construída.
//
// Até 31/07/2026 isso ligava o tenant inteiro (upsert por tenantId, que era
// @unique) — quebrava na prática assim que se precisava de uma SEGUNDA
// Channex property pro mesmo tenant (ex.: isolar uma UH específica numa
// property própria pra testar conexão real de OTA sem arriscar o resto):
// rodar de novo sobrescrevia o mapeamento existente em vez de criar um
// novo. Agora é por Property (--property-id obrigatório, o id da Property
// no Praxis — não confundir com --channex-property-id, que é o UUID do
// lado da Channex) e o upsert usa channexPropertyId (já único) como chave,
// então mapear uma property nova nunca mais pisa numa já existente.
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
//     --property-id e025e3f0-7255-4f6d-a31e-26bc19dd64fe \
//     --channex-property-id 716305c4-561a-4561-a187-7f5b8aeb5920 \
//     --room-uh 994d1375-dbbd-4072-8724-b2ab32ce781b=cmrnwnovl0005a1y53s7kn1zm \
//     --room a07e712e-cb34-4ec9-b085-63e59a88c249=Suite
//
// --property-id é o id da Property no Praxis (ver tela Configurações > UHs,
// ou consultar o banco) — diferente de --channex-property-id, que é o UUID
// da property no dashboard da Channex (Properties > [sua property] > Rooms
// & Rates, mesmo lugar de onde vêm os UUIDs de room type). O uhId em
// --room-uh vem do banco do Praxis (id da UH, não o número/nome dela).
import { prisma } from "../src/prisma";

function parseArgs() {
  const args = process.argv.slice(2);
  const out: {
    tenantSlug?: string;
    propertyId?: string;
    channexPropertyId?: string;
    roomsPorTipo: Array<{ id: string; tipo: string }>;
    roomsPorUh: Array<{ id: string; uhId: string }>;
  } = { roomsPorTipo: [], roomsPorUh: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tenant-slug") out.tenantSlug = args[++i];
    else if (args[i] === "--property-id") out.propertyId = args[++i];
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
  const { tenantSlug, propertyId, channexPropertyId, roomsPorTipo, roomsPorUh } = parseArgs();
  if (!tenantSlug || !propertyId || !channexPropertyId) {
    console.error(
      "Uso: npx tsx scripts/mapear-channex.ts --tenant-slug <slug> --property-id <id da Property no Praxis> --channex-property-id <uuid> [--room <channexRoomTypeId>=<uhTipo> ...] [--room-uh <channexRoomTypeId>=<uhId> ...]"
    );
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) throw new Error(`Tenant "${tenantSlug}" não encontrado.`);

  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property || property.tenantId !== tenant.id) {
    throw new Error(`Property "${propertyId}" não encontrada (ou não pertence ao tenant "${tenantSlug}").`);
  }

  // Upsert por channexPropertyId (já único) — não por tenantId nem
  // propertyId sozinhos, exatamente pra permitir mapear uma SEGUNDA
  // property Channex pro mesmo tenant sem sobrescrever a primeira (ver
  // comentário no topo do arquivo).
  const propertyMapping = await prisma.channexPropertyMapping.upsert({
    where: { channexPropertyId },
    update: { tenantId: tenant.id, propertyId: property.id },
    create: { tenantId: tenant.id, propertyId: property.id, channexPropertyId },
  });
  console.log(`Property mapeada: "${property.nome}" (Praxis) <-> Channex property ${channexPropertyId}`);

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
