-- CreateTable
CREATE TABLE "DemoLead" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "hotel" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "mensagem" TEXT,
    "atendido" BOOLEAN NOT NULL DEFAULT false,
    "atendidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemoLead_createdAt_idx" ON "DemoLead"("createdAt");
