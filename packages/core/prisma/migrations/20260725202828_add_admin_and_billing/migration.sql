-- CreateTable
CREATE TABLE "HkBlockRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uhId" TEXT NOT NULL,
    "checklistItemId" TEXT,
    "itemNome" TEXT,
    "comment" TEXT NOT NULL,
    "solicitanteNome" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "decididoPorId" TEXT,
    "decididoPorNome" TEXT,
    "decididoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HkBlockRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "stripePriceId" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "intervalo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SEM_ASSINATURA',
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckoutUrl" TEXT,
    "lastCheckoutCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "stripeInvoiceId" TEXT,
    "tipo" TEXT NOT NULL,
    "valorCentavos" INTEGER,
    "status" TEXT,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HkBlockRequest_tenantId_status_idx" ON "HkBlockRequest"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_stripePriceId_key" ON "SubscriptionPlan"("stripePriceId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSubscription_tenantId_key" ON "TenantSubscription"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSubscription_stripeCustomerId_key" ON "TenantSubscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSubscription_stripeSubscriptionId_key" ON "TenantSubscription"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_stripeEventId_key" ON "PaymentEvent"("stripeEventId");

-- CreateIndex
CREATE INDEX "PaymentEvent_tenantId_createdAt_idx" ON "PaymentEvent"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "HkBlockRequest" ADD CONSTRAINT "HkBlockRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HkBlockRequest" ADD CONSTRAINT "HkBlockRequest_uhId_fkey" FOREIGN KEY ("uhId") REFERENCES "UH"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HkBlockRequest" ADD CONSTRAINT "HkBlockRequest_decididoPorId_fkey" FOREIGN KEY ("decididoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
