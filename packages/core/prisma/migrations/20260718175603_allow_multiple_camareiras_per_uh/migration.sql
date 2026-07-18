-- DropIndex
DROP INDEX "DailyAssignment_data_uhId_key";

-- CreateIndex
CREATE UNIQUE INDEX "DailyAssignment_data_uhId_camareiraId_key" ON "DailyAssignment"("data", "uhId", "camareiraId");

