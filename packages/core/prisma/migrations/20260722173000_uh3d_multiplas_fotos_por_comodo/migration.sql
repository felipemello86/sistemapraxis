-- Permite mais de uma foto por cômodo (UH 3D). Antes só existia uma
-- MaintenanceUhImage por (uhId, tipo); agora é uma lista, ordenada por
-- createdAt asc na aplicação. Spots continuam presos a uma imagem específica
-- (MaintenanceUhSpot.imageId), então nada muda nesse nível.

-- DropIndex (era a constraint única (uhId, tipo))
DROP INDEX "MaintenanceUhImage_uhId_tipo_key";

-- CreateIndex (mesma coluna, sem exclusividade — só pra performance de leitura)
CREATE INDEX "MaintenanceUhImage_uhId_tipo_idx" ON "MaintenanceUhImage"("uhId", "tipo");
