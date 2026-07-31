/*
  Warnings:

  - A unique constraint covering the columns `[propertyId]` on the table `ChannexPropertyMapping` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "ChannexPropertyMapping_tenantId_key";

-- AlterTable
ALTER TABLE "ChannexPropertyMapping" ADD COLUMN     "propertyId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ChannexPropertyMapping_propertyId_key" ON "ChannexPropertyMapping"("propertyId");

-- CreateIndex
CREATE INDEX "ChannexPropertyMapping_tenantId_idx" ON "ChannexPropertyMapping"("tenantId");

-- AddForeignKey
ALTER TABLE "ChannexPropertyMapping" ADD CONSTRAINT "ChannexPropertyMapping_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
