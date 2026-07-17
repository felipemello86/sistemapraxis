/*
  Warnings:

  - Made the column `propertyId` on table `UH` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "UH" DROP CONSTRAINT "UH_propertyId_fkey";

-- AlterTable
ALTER TABLE "UH" ALTER COLUMN "propertyId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "UH" ADD CONSTRAINT "UH_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
