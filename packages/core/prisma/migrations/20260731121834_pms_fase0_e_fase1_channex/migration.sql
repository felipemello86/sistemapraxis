-- DropForeignKey
ALTER TABLE "Reserva" DROP CONSTRAINT "Reserva_uhId_fkey";

-- AlterTable
ALTER TABLE "Reserva" ADD COLUMN     "uhTipoSolicitado" TEXT,
ALTER COLUMN "uhId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ChannexPropertyMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channexPropertyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannexPropertyMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannexRoomMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channexRoomTypeId" TEXT NOT NULL,
    "uhTipo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannexRoomMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannexPropertyMapping_tenantId_key" ON "ChannexPropertyMapping"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannexPropertyMapping_channexPropertyId_key" ON "ChannexPropertyMapping"("channexPropertyId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannexRoomMapping_channexRoomTypeId_key" ON "ChannexRoomMapping"("channexRoomTypeId");

-- CreateIndex
CREATE INDEX "ChannexRoomMapping_tenantId_idx" ON "ChannexRoomMapping"("tenantId");

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_uhId_fkey" FOREIGN KEY ("uhId") REFERENCES "UH"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannexPropertyMapping" ADD CONSTRAINT "ChannexPropertyMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannexRoomMapping" ADD CONSTRAINT "ChannexRoomMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
