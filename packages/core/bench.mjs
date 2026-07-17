import { PrismaClient } from "./generated/index.js";
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: "bnbflex" } });
  console.log("tenantId:", tenant?.id);

  const countReviews = await prisma.review.count({ where: { tenantId: tenant.id } });
  console.log("total reviews:", countReviews);

  const countPending = await prisma.pendingAirbnbImport.count({ where: { tenantId: tenant.id } });
  console.log("total pending airbnb imports:", countPending);

  let t0 = Date.now();
  const reviews = await prisma.review.findMany({
    where: { tenantId: tenant.id },
    orderBy: { guestSubmittedAt: "desc" },
    include: {
      property: true,
      attendants: { include: { attendant: true } },
      categories: { include: { category: true } },
      actionPlan: { include: { items: { include: { completedBy: true } } } },
      efficacyChecks: true,
      managerialNotes: { include: { author: true }, orderBy: { createdAt: "desc" } },
      attachments: { include: { uploadedBy: true }, orderBy: { createdAt: "desc" } },
      logs: { include: { actor: true }, orderBy: { createdAt: "desc" } },
    },
  });
  console.log("tratamento query (cold):", Date.now() - t0, "ms, rows:", reviews.length);

  t0 = Date.now();
  await prisma.review.findMany({
    where: { tenantId: tenant.id },
    orderBy: { guestSubmittedAt: "desc" },
    include: {
      property: true,
      attendants: { include: { attendant: true } },
      categories: { include: { category: true } },
      actionPlan: { include: { items: { include: { completedBy: true } } } },
      efficacyChecks: true,
      managerialNotes: { include: { author: true }, orderBy: { createdAt: "desc" } },
      attachments: { include: { uploadedBy: true }, orderBy: { createdAt: "desc" } },
      logs: { include: { actor: true }, orderBy: { createdAt: "desc" } },
    },
  });
  console.log("tratamento query (warm):", Date.now() - t0, "ms");

  t0 = Date.now();
  await prisma.pendingAirbnbImport.findMany({ where: { tenantId: tenant.id }, orderBy: { guestSubmittedAt: "desc" } });
  console.log("pendingAirbnbImport query:", Date.now() - t0, "ms");

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
