-- Add shared, privacy-preserving counters for public authentication limits.
BEGIN;

CREATE TABLE "AuthRateLimitBucket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "policyKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "subjectHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "windowEndsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthRateLimitBucket_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AuthRateLimitBucket_attempts_check" CHECK ("attempts" >= 0),
    CONSTRAINT "AuthRateLimitBucket_window_check" CHECK ("windowEndsAt" > "windowStartedAt"),
    CONSTRAINT "AuthRateLimitBucket_scope_check" CHECK ("scope" IN ('ip', 'identity', 'tenant'))
);

CREATE UNIQUE INDEX "AuthRateLimitBucket_policyKey_subjectHash_key"
ON "AuthRateLimitBucket"("policyKey", "subjectHash");

CREATE INDEX "AuthRateLimitBucket_tenantId_action_idx"
ON "AuthRateLimitBucket"("tenantId", "action");

CREATE INDEX "AuthRateLimitBucket_windowEndsAt_idx"
ON "AuthRateLimitBucket"("windowEndsAt");

ALTER TABLE "AuthRateLimitBucket"
ADD CONSTRAINT "AuthRateLimitBucket_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
