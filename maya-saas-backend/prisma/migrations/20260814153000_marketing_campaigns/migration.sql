-- Consent-safe, tenant-scoped audiences and owner-approved in-app campaigns.
CREATE TABLE "MarketingAudience" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "ruleJson" JSONB NOT NULL,
    "recipientUserIdsJson" JSONB NOT NULL,
    "candidateCount" INTEGER NOT NULL,
    "eligibleCount" INTEGER NOT NULL,
    "unavailableCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingAudience_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "audienceId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'app',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "message" TEXT NOT NULL,
    "recipientUserIdsJson" JSONB NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketingAudience_tenantId_createdAt_idx"
ON "MarketingAudience"("tenantId", "createdAt");
CREATE INDEX "MarketingAudience_tenantId_expiresAt_idx"
ON "MarketingAudience"("tenantId", "expiresAt");
CREATE UNIQUE INDEX "MarketingCampaign_tenantId_idempotencyKey_key"
ON "MarketingCampaign"("tenantId", "idempotencyKey");
CREATE INDEX "MarketingCampaign_tenantId_status_createdAt_idx"
ON "MarketingCampaign"("tenantId", "status", "createdAt");
CREATE INDEX "MarketingCampaign_tenantId_audienceId_idx"
ON "MarketingCampaign"("tenantId", "audienceId");

ALTER TABLE "MarketingAudience"
ADD CONSTRAINT "MarketingAudience_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingCampaign"
ADD CONSTRAINT "MarketingCampaign_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketingCampaign"
ADD CONSTRAINT "MarketingCampaign_audienceId_fkey"
FOREIGN KEY ("audienceId") REFERENCES "MarketingAudience"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
