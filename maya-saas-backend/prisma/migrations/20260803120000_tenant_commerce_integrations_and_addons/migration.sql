CREATE TABLE "CommerceIntegration" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'yookassa',
  "encryptedShopId" TEXT NOT NULL,
  "encryptedSecretKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "verifiedAt" TIMESTAMP(3),
  "lastCheckedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommerceIntegration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommerceIntegration_tenantId_key"
  ON "CommerceIntegration"("tenantId");

ALTER TABLE "CommerceIntegration"
  ADD CONSTRAINT "CommerceIntegration_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Store, certificates, memberships and referrals are separately purchased
-- tenant add-ons. They must not be enabled implicitly by a base plan.
UPDATE "PlanEntitlement"
SET "enabled" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "featureKey" IN (
  'shop',
  'commerce.store',
  'commerce.certificates',
  'commerce.memberships',
  'commerce.redemption',
  'referrals'
);

UPDATE "SubscriptionPlan"
SET "featuresJson" = COALESCE("featuresJson", '{}'::jsonb)
  - 'shop'
  - 'commerce.store'
  - 'commerce.certificates'
  - 'commerce.memberships'
  - 'commerce.redemption'
  - 'referrals',
  "updatedAt" = CURRENT_TIMESTAMP;
