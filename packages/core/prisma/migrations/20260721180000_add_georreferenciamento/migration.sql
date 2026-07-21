-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "GeoArrival" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "camareiraId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "chegadaEm" TIMESTAMP(3) NOT NULL,
    "distanciaMetros" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeoArrival_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeoArrival_tenantId_data_camareiraId_propertyId_key" ON "GeoArrival"("tenantId", "data", "camareiraId", "propertyId");

-- AddForeignKey
ALTER TABLE "GeoArrival" ADD CONSTRAINT "GeoArrival_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeoArrival" ADD CONSTRAINT "GeoArrival_camareiraId_fkey" FOREIGN KEY ("camareiraId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeoArrival" ADD CONSTRAINT "GeoArrival_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

