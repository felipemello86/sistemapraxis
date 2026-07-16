import { PrismaClient } from "../generated";

// Singleton em globalThis pra não recriar conexão a cada hot-reload em dev
// (padrão idêntico ao usado nos 4 apps da v1 — essa parte nunca foi o
// problema, só a duplicação de código em si).
const globalForPrisma = globalThis as unknown as { praxisPrisma: PrismaClient | undefined };

export const prisma = globalForPrisma.praxisPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.praxisPrisma = prisma;
}
