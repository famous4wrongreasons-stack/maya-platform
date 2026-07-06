-- CreateTable
CREATE TABLE "BillingPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'yookassa',
    "providerPaymentId" TEXT,
    "idempotenceKey" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "amountKopecks" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "confirmationUrl" TEXT,
    "returnUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "providerPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_providerPaymentId_key" ON "BillingPayment"("providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayment_idempotenceKey_key" ON "BillingPayment"("idempotenceKey");

-- CreateIndex
CREATE INDEX "BillingPayment_tenantId_createdAt_idx" ON "BillingPayment"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingPayment_tenantId_status_idx" ON "BillingPayment"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BillingPayment_provider_providerPaymentId_idx" ON "BillingPayment"("provider", "providerPaymentId");

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
