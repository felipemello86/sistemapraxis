-- CreateTable
CREATE TABLE "Hospede" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "documentoTipo" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "nacionalidade" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hospede_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reserva" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uhId" TEXT NOT NULL,
    "hospedeId" TEXT NOT NULL,
    "checkInData" TEXT NOT NULL,
    "checkOutData" TEXT NOT NULL,
    "checkInRealizadoEm" TIMESTAMP(3),
    "checkOutRealizadoEm" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'CONFIRMADA',
    "adultos" INTEGER NOT NULL DEFAULT 1,
    "criancas" INTEGER NOT NULL DEFAULT 0,
    "canal" TEXT NOT NULL,
    "canalReservaId" TEXT,
    "valorTotal" DECIMAL(10,2),
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BloqueioDisponibilidade" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uhId" TEXT NOT NULL,
    "dataInicio" TEXT NOT NULL,
    "dataFim" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "descricao" TEXT,
    "criadoPorNome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BloqueioDisponibilidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TarifaDiaria" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uhId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "preco" DECIMAL(10,2) NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "estadiaMinima" INTEGER NOT NULL DEFAULT 1,
    "fechadoParaVenda" BOOLEAN NOT NULL DEFAULT false,
    "atualizadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TarifaDiaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Folio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "fechadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Folio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FolioItem" (
    "id" TEXT NOT NULL,
    "folioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "data" TEXT NOT NULL,
    "origemTipo" TEXT,
    "origemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FolioItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Hospede_tenantId_idx" ON "Hospede"("tenantId");

-- CreateIndex
CREATE INDEX "Hospede_tenantId_documento_idx" ON "Hospede"("tenantId", "documento");

-- CreateIndex
CREATE INDEX "Reserva_tenantId_uhId_checkInData_idx" ON "Reserva"("tenantId", "uhId", "checkInData");

-- CreateIndex
CREATE UNIQUE INDEX "Reserva_tenantId_canal_canalReservaId_key" ON "Reserva"("tenantId", "canal", "canalReservaId");

-- CreateIndex
CREATE INDEX "BloqueioDisponibilidade_tenantId_uhId_dataInicio_idx" ON "BloqueioDisponibilidade"("tenantId", "uhId", "dataInicio");

-- CreateIndex
CREATE UNIQUE INDEX "TarifaDiaria_tenantId_uhId_data_key" ON "TarifaDiaria"("tenantId", "uhId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "Folio_reservaId_key" ON "Folio"("reservaId");

-- AddForeignKey
ALTER TABLE "Hospede" ADD CONSTRAINT "Hospede_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_uhId_fkey" FOREIGN KEY ("uhId") REFERENCES "UH"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_hospedeId_fkey" FOREIGN KEY ("hospedeId") REFERENCES "Hospede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueioDisponibilidade" ADD CONSTRAINT "BloqueioDisponibilidade_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueioDisponibilidade" ADD CONSTRAINT "BloqueioDisponibilidade_uhId_fkey" FOREIGN KEY ("uhId") REFERENCES "UH"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifaDiaria" ADD CONSTRAINT "TarifaDiaria_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarifaDiaria" ADD CONSTRAINT "TarifaDiaria_uhId_fkey" FOREIGN KEY ("uhId") REFERENCES "UH"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folio" ADD CONSTRAINT "Folio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folio" ADD CONSTRAINT "Folio_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "Reserva"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolioItem" ADD CONSTRAINT "FolioItem_folioId_fkey" FOREIGN KEY ("folioId") REFERENCES "Folio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
