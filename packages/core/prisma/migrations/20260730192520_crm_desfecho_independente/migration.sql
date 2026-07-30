/*
  Warnings:

  - You are about to drop the column `ehGanho` on the `PipelineStage` table. All the data in the column will be lost.
  - You are about to drop the column `ehPerdido` on the `PipelineStage` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "LeadDesfecho" AS ENUM ('ABERTO', 'GANHO', 'PERDIDO');

-- AlterTable
ALTER TABLE "DemoLead" ADD COLUMN     "desfecho" "LeadDesfecho" NOT NULL DEFAULT 'ABERTO';

-- AlterTable
ALTER TABLE "PipelineStage" DROP COLUMN "ehGanho",
DROP COLUMN "ehPerdido";
