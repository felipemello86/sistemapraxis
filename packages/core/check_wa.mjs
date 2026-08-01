import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const lead = await prisma.demoLead.findFirst({
  where: { telefone: { contains: "996532808" } },
  include: { whatsappMensagens: { orderBy: { createdAt: "desc" } } },
});

console.log(JSON.stringify(lead, null, 2));
await prisma.$disconnect();
