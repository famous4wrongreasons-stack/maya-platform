ALTER TABLE "Appointment"
  ADD COLUMN "totalPriceKopecks" INTEGER,
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'RUB';

CREATE TABLE "CustomerProfile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "preferredLocale" TEXT,
  "privacyConsentAt" TIMESTAMP(3),
  "marketingConsentAt" TIMESTAMP(3),
  "encryptedNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyAccount" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'internal',
  "balance" INTEGER NOT NULL DEFAULT 0,
  "externalReference" TEXT,
  "syncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoyaltyAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyTransaction" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorTenantId" TEXT,
  "kind" TEXT NOT NULL,
  "delta" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "encryptedReason" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "externalRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Expense" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "branchTenantId" TEXT,
  "createdById" TEXT,
  "createdByTenantId" TEXT,
  "category" TEXT NOT NULL,
  "amountKopecks" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "encryptedNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerProfile_userId_tenantId_key"
  ON "CustomerProfile"("userId", "tenantId");
CREATE INDEX "CustomerProfile_tenantId_updatedAt_idx"
  ON "CustomerProfile"("tenantId", "updatedAt");

CREATE UNIQUE INDEX "LoyaltyAccount_id_tenantId_key"
  ON "LoyaltyAccount"("id", "tenantId");
CREATE UNIQUE INDEX "LoyaltyAccount_userId_tenantId_key"
  ON "LoyaltyAccount"("userId", "tenantId");
CREATE INDEX "LoyaltyAccount_tenantId_source_updatedAt_idx"
  ON "LoyaltyAccount"("tenantId", "source", "updatedAt");

CREATE UNIQUE INDEX "LoyaltyTransaction_tenantId_idempotencyKey_key"
  ON "LoyaltyTransaction"("tenantId", "idempotencyKey");
CREATE INDEX "LoyaltyTransaction_tenantId_accountId_createdAt_idx"
  ON "LoyaltyTransaction"("tenantId", "accountId", "createdAt");
CREATE INDEX "LoyaltyTransaction_tenantId_actorUserId_createdAt_idx"
  ON "LoyaltyTransaction"("tenantId", "actorUserId", "createdAt");

CREATE UNIQUE INDEX "Expense_id_tenantId_key"
  ON "Expense"("id", "tenantId");
CREATE INDEX "Expense_tenantId_occurredAt_idx"
  ON "Expense"("tenantId", "occurredAt");
CREATE INDEX "Expense_tenantId_branchId_occurredAt_idx"
  ON "Expense"("tenantId", "branchId", "occurredAt");
CREATE UNIQUE INDEX "Branch_id_tenantId_key"
  ON "Branch"("id", "tenantId");

ALTER TABLE "CustomerProfile"
  ADD CONSTRAINT "CustomerProfile_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerProfile"
  ADD CONSTRAINT "CustomerProfile_userId_tenantId_fkey"
  FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LoyaltyAccount"
  ADD CONSTRAINT "LoyaltyAccount_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyAccount"
  ADD CONSTRAINT "LoyaltyAccount_userId_tenantId_fkey"
  FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LoyaltyTransaction"
  ADD CONSTRAINT "LoyaltyTransaction_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyTransaction"
  ADD CONSTRAINT "LoyaltyTransaction_accountId_tenantId_fkey"
  FOREIGN KEY ("accountId", "tenantId") REFERENCES "LoyaltyAccount"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyTransaction"
  ADD CONSTRAINT "LoyaltyTransaction_actorUserId_tenantId_fkey"
  FOREIGN KEY ("actorUserId", "actorTenantId") REFERENCES "User"("id", "tenantId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_branchId_fkey"
  FOREIGN KEY ("branchId", "branchTenantId") REFERENCES "Branch"("id", "tenantId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_createdById_tenantId_fkey"
  FOREIGN KEY ("createdById", "createdByTenantId") REFERENCES "User"("id", "tenantId") ON DELETE SET NULL ON UPDATE CASCADE;
