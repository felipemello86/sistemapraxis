-- AlterTable
ALTER TABLE "MaintenanceItemInfo" ADD COLUMN "photos" TEXT NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "MaintenanceItemInfoLog" ADD COLUMN "previousPhotos" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "MaintenanceItemInfoLog" ADD COLUMN "newPhotos" TEXT NOT NULL DEFAULT '[]';
