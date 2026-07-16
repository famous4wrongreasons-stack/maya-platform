ALTER TABLE "CrmIntegration"
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "lastCheckedAt" TIMESTAMP(3),
  ADD COLUMN "lastSyncAt" TIMESTAMP(3),
  ADD COLUMN "lastErrorCode" TEXT,
  ADD COLUMN "lastErrorAt" TIMESTAMP(3);

-- Existing active connectors were already used by production code. Preserve
-- compatibility while all new and replaced credentials use verify-before-save.
UPDATE "CrmIntegration"
SET
  "verifiedAt" = "updatedAt",
  "lastCheckedAt" = "updatedAt"
WHERE "status" = 'active';
