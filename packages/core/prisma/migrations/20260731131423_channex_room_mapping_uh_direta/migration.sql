-- AlterTable
ALTER TABLE "ChannexRoomMapping" ADD COLUMN     "uhId" TEXT;

-- AddForeignKey
ALTER TABLE "ChannexRoomMapping" ADD CONSTRAINT "ChannexRoomMapping_uhId_fkey" FOREIGN KEY ("uhId") REFERENCES "UH"("id") ON DELETE SET NULL ON UPDATE CASCADE;
