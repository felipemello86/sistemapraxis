const { PrismaClient } = require('./generated/default.js');
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: 'bnbflex' }, select: { id: true, slug: true } });
  console.log('tenant', tenant);
  if (!tenant) return;

  const camareira = await prisma.user.findFirst({ where: { tenantId: tenant.id, nome: { contains: 'Iasmyn' } }, select: { id: true, nome: true } });
  console.log('camareira', camareira);

  const uh = await prisma.uH.findFirst({ where: { tenantId: tenant.id, numero: '805-V' }, select: { id: true, numero: true, propertyId: true } });
  console.log('uh', uh);
}
main().catch(e => console.error('ERR', e.message)).finally(() => prisma.$disconnect());
