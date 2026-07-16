-- CreateTable
CREATE TABLE "HkConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "notificationTime" TEXT NOT NULL DEFAULT '08:00',
    "targetMinutes" INTEGER NOT NULL DEFAULT 25,
    "photoRequirements" TEXT NOT NULL DEFAULT '["cozinha","cama","toalhas","banheiro"]',

    CONSTRAINT "HkConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "InspectionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UH" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'Standard',
    "status" TEXT NOT NULL DEFAULT 'OCUPADO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "emManutencao" BOOLEAN NOT NULL DEFAULT false,
    "manutencaoDescricao" TEXT,
    "bloqueada" BOOLEAN NOT NULL DEFAULT false,
    "bloqueioDescricao" TEXT,
    "bloqueioSolicitanteNome" TEXT,
    "bloqueioEm" TIMESTAMP(3),

    CONSTRAINT "UH_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyUHSelection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "uhId" TEXT NOT NULL,
    "liberada" BOOLEAN NOT NULL DEFAULT false,
    "liberadaEm" TIMESTAMP(3),
    "liberadoPorNome" TEXT,
    "temReserva" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DailyUHSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoberturaFolga" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "governantaId" TEXT NOT NULL,
    "substitutaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoberturaFolga_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySelectionStatus" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "confirmado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DailySelectionStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleaningProgram" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'ARRUMACAO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CleaningProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramStep" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,

    CONSTRAINT "ProgramStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "uhId" TEXT NOT NULL,
    "camareiraId" TEXT NOT NULL,
    "programId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "liberadaEm" TIMESTAMP(3),
    "criadoPorNome" TEXT,
    "observacoes" TEXT,
    "solicitacaoMensagem" TEXT,
    "solicitacaoStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleaningSession" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "uhId" TEXT NOT NULL,
    "camareiraId" TEXT NOT NULL,
    "iniciadaEm" TIMESTAMP(3) NOT NULL,
    "finalizadaEm" TIMESTAMP(3),
    "duracaoSegundos" INTEGER,
    "fotos" TEXT NOT NULL DEFAULT '[]',
    "observacoes" TEXT,
    "comentarioCamareira" TEXT,
    "excluidoDoScore" BOOLEAN NOT NULL DEFAULT false,
    "justificativaExclusao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CleaningSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionStep" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "iniciadoEm" TIMESTAMP(3) NOT NULL,
    "finalizadoEm" TIMESTAMP(3),
    "duracaoSegundos" INTEGER,

    CONSTRAINT "SessionStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionSession" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "uhId" TEXT NOT NULL,
    "governantaId" TEXT NOT NULL,
    "iniciadaEm" TIMESTAMP(3) NOT NULL,
    "finalizadaEm" TIMESTAMP(3),
    "totalFalhas" INTEGER NOT NULL DEFAULT 0,
    "totalFalhasGerenciais" INTEGER NOT NULL DEFAULT 0,
    "comentarioGovernanta" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionItem" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "resultado" TEXT NOT NULL DEFAULT 'OK',
    "tipoFalha" TEXT NOT NULL DEFAULT 'CAMAREIRA',
    "observacao" TEXT,

    CONSTRAINT "InspectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FalhaLavanderia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "uhNumero" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "reportadoPorNome" TEXT NOT NULL,
    "reportadoPorRole" TEXT NOT NULL,
    "fotoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FalhaLavanderia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HkConfig_tenantId_key" ON "HkConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UH_tenantId_numero_key" ON "UH"("tenantId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "DailyUHSelection_data_uhId_key" ON "DailyUHSelection"("data", "uhId");

-- CreateIndex
CREATE UNIQUE INDEX "CoberturaFolga_tenantId_data_key" ON "CoberturaFolga"("tenantId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "DailySelectionStatus_tenantId_data_key" ON "DailySelectionStatus"("tenantId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "DailyAssignment_data_uhId_key" ON "DailyAssignment"("data", "uhId");

-- CreateIndex
CREATE UNIQUE INDEX "CleaningSession_assignmentId_key" ON "CleaningSession"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionSession_sessionId_key" ON "InspectionSession"("sessionId");

-- AddForeignKey
ALTER TABLE "HkConfig" ADD CONSTRAINT "HkConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionTemplate" ADD CONSTRAINT "InspectionTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UH" ADD CONSTRAINT "UH_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyUHSelection" ADD CONSTRAINT "DailyUHSelection_uhId_fkey" FOREIGN KEY ("uhId") REFERENCES "UH"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningProgram" ADD CONSTRAINT "CleaningProgram_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramStep" ADD CONSTRAINT "ProgramStep_programId_fkey" FOREIGN KEY ("programId") REFERENCES "CleaningProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyAssignment" ADD CONSTRAINT "DailyAssignment_uhId_fkey" FOREIGN KEY ("uhId") REFERENCES "UH"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyAssignment" ADD CONSTRAINT "DailyAssignment_camareiraId_fkey" FOREIGN KEY ("camareiraId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyAssignment" ADD CONSTRAINT "DailyAssignment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "CleaningProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningSession" ADD CONSTRAINT "CleaningSession_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "DailyAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningSession" ADD CONSTRAINT "CleaningSession_uhId_fkey" FOREIGN KEY ("uhId") REFERENCES "UH"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningSession" ADD CONSTRAINT "CleaningSession_camareiraId_fkey" FOREIGN KEY ("camareiraId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionStep" ADD CONSTRAINT "SessionStep_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CleaningSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionStep" ADD CONSTRAINT "SessionStep_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ProgramStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSession" ADD CONSTRAINT "InspectionSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CleaningSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSession" ADD CONSTRAINT "InspectionSession_uhId_fkey" FOREIGN KEY ("uhId") REFERENCES "UH"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSession" ADD CONSTRAINT "InspectionSession_governantaId_fkey" FOREIGN KEY ("governantaId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionItem" ADD CONSTRAINT "InspectionItem_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FalhaLavanderia" ADD CONSTRAINT "FalhaLavanderia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
