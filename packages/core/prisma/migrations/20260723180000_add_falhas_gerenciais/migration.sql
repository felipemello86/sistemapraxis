-- AlterTable
ALTER TABLE "InspectionTemplate" ADD COLUMN "tipoFalha" TEXT NOT NULL DEFAULT 'CAMAREIRA';

-- CreateTable
CREATE TABLE "HkManagerialFailureCard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inspectionItemId" TEXT NOT NULL,
    "uhId" TEXT NOT NULL,
    "itemNome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "resolvedDescricao" TEXT,
    "resolvedPhotos" TEXT NOT NULL DEFAULT '[]',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HkManagerialFailureCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HkManagerialFailureCard_inspectionItemId_key" ON "HkManagerialFailureCard"("inspectionItemId");

-- AddForeignKey
ALTER TABLE "HkManagerialFailureCard" ADD CONSTRAINT "HkManagerialFailureCard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HkManagerialFailureCard" ADD CONSTRAINT "HkManagerialFailureCard_inspectionItemId_fkey" FOREIGN KEY ("inspectionItemId") REFERENCES "InspectionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HkManagerialFailureCard" ADD CONSTRAINT "HkManagerialFailureCard_uhId_fkey" FOREIGN KEY ("uhId") REFERENCES "UH"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HkManagerialFailureCard" ADD CONSTRAINT "HkManagerialFailureCard_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
