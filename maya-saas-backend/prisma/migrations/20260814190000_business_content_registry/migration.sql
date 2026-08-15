-- Tenant-scoped catalogs, referral configuration and privacy-safe reviews.
CREATE TABLE "TenantCatalogItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceKopecks" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "quantity" INTEGER,
    "lowStockThreshold" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "externalRef" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantCatalogItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferralProgram" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "inviterRewardKopecks" INTEGER,
    "inviteeRewardKopecks" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "terms" TEXT,
    "codePrefix" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralProgram_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalRef" TEXT,
    "source" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "encryptedText" TEXT,
    "topicTagsJson" JSONB,
    "branchId" TEXT,
    "staffExternalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessReview_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TenantCatalogItem"
ADD CONSTRAINT "TenantCatalogItem_kind_check"
CHECK ("kind" IN ('inventory', 'certificate', 'membership')),
ADD CONSTRAINT "TenantCatalogItem_priceKopecks_check"
CHECK ("priceKopecks" IS NULL OR "priceKopecks" >= 0),
ADD CONSTRAINT "TenantCatalogItem_quantity_check"
CHECK ("quantity" IS NULL OR "quantity" >= 0),
ADD CONSTRAINT "TenantCatalogItem_lowStockThreshold_check"
CHECK ("lowStockThreshold" IS NULL OR "lowStockThreshold" >= 0);

ALTER TABLE "ReferralProgram"
ADD CONSTRAINT "ReferralProgram_inviterRewardKopecks_check"
CHECK ("inviterRewardKopecks" IS NULL OR "inviterRewardKopecks" >= 0),
ADD CONSTRAINT "ReferralProgram_inviteeRewardKopecks_check"
CHECK ("inviteeRewardKopecks" IS NULL OR "inviteeRewardKopecks" >= 0);

ALTER TABLE "BusinessReview"
ADD CONSTRAINT "BusinessReview_rating_check"
CHECK ("rating" BETWEEN 1 AND 5);

CREATE UNIQUE INDEX "TenantCatalogItem_tenantId_kind_externalRef_key"
ON "TenantCatalogItem"("tenantId", "kind", "externalRef");
CREATE INDEX "TenantCatalogItem_tenantId_kind_active_idx"
ON "TenantCatalogItem"("tenantId", "kind", "active");

CREATE UNIQUE INDEX "ReferralProgram_tenantId_key"
ON "ReferralProgram"("tenantId");

CREATE UNIQUE INDEX "BusinessReview_tenantId_source_externalRef_key"
ON "BusinessReview"("tenantId", "source", "externalRef");
CREATE INDEX "BusinessReview_tenantId_occurredAt_idx"
ON "BusinessReview"("tenantId", "occurredAt");
CREATE INDEX "BusinessReview_tenantId_rating_occurredAt_idx"
ON "BusinessReview"("tenantId", "rating", "occurredAt");

ALTER TABLE "TenantCatalogItem"
ADD CONSTRAINT "TenantCatalogItem_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReferralProgram"
ADD CONSTRAINT "ReferralProgram_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessReview"
ADD CONSTRAINT "BusinessReview_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
