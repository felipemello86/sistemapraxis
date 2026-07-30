/*
  Warnings:

  - You are about to drop the column `responsavelId` on the `DemoLead` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "DemoLead" DROP CONSTRAINT "DemoLead_responsavelId_fkey";

-- AlterTable
ALTER TABLE "DemoLead" DROP COLUMN "responsavelId",
ADD COLUMN     "fonte" TEXT NOT NULL DEFAULT 'Site';
