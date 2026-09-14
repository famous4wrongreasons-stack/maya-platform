-- CYCLE 06 B3.1: durable recipient-level communication delivery foundation.
--
-- This migration is additive for legacy data. Existing rows remain at
-- lifecycleVersion=0 and therefore keep their historical, unresolved truth.
-- No delivery outcome is inferred or backfilled.

-- CreateEnum
CREATE TYPE "CommunicationScope" AS ENUM ('SINGLE', 'BULK');

-- CreateEnum
CREATE TYPE "CommunicationDeliveryState" AS ENUM ('NOT_SENT', 'ACCEPTED', 'DELIVERED', 'FAILED', 'UNKNOWN', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CommunicationCampaignState" AS ENUM ('DRAFT', 'READY', 'RUNNING', 'UNRESOLVED', 'COMPLETED', 'PARTIAL', 'FAILED', 'SKIPPED', 'CANCELLED', 'EXPIRED', 'LEGACY_UNRESOLVED');

-- Replace the legacy recipient relation with a tenant+campaign-qualified one.
ALTER TABLE "MarketingDeliveryAttempt"
  DROP CONSTRAINT "MarketingDeliveryAttempt_recipientId_tenantId_fkey";

ALTER TABLE "MarketingCampaign"
  DROP CONSTRAINT "MarketingCampaign_audienceId_fkey";

-- Recipient lifecycle. Nullable typed fields deliberately preserve legacy rows.
ALTER TABLE "MarketingCampaignRecipient"
  ADD COLUMN "auditRetentionUntil" TIMESTAMP(3),
  ADD COLUMN "consentEvidenceId" TEXT,
  ADD COLUMN "contentIdentityHash" TEXT,
  ADD COLUMN "deliveryState" "CommunicationDeliveryState",
  ADD COLUMN "dispatchedAt" TIMESTAMP(3),
  ADD COLUMN "eligibilityBasis" TEXT,
  ADD COLUMN "eligibilityCheckedAt" TIMESTAMP(3),
  ADD COLUMN "eligibilityDecision" TEXT,
  ADD COLUMN "eligibilityEvidenceHash" TEXT,
  ADD COLUMN "eligibilityEvidenceRef" TEXT,
  ADD COLUMN "eligibilityPolicyVersion" INTEGER,
  ADD COLUMN "externalDispatchState" "ExternalDispatchState",
  ADD COLUMN "identityVersion" INTEGER,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "leaseOwner" TEXT,
  ADD COLUMN "leaseTokenHash" TEXT,
  ADD COLUMN "lifecycleVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "payloadRetentionUntil" TIMESTAMP(3),
  ADD COLUMN "recipientKind" TEXT,
  ADD COLUMN "recipientRefHash" TEXT,
  ADD COLUMN "reconciliationState" "ActionReconciliationState",
  ADD COLUMN "responseReceivedAt" TIMESTAMP(3),
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "terminalAt" TIMESTAMP(3),
  ADD COLUMN "terminalReasonCode" TEXT,
  ADD COLUMN "unknownAt" TIMESTAMP(3);

-- Attempt lifecycle. Provider payloads and credentials are intentionally absent.
ALTER TABLE "MarketingDeliveryAttempt"
  ADD COLUMN "dispatchedAt" TIMESTAMP(3),
  ADD COLUMN "externalDispatchState" "ExternalDispatchState",
  ADD COLUMN "kind" "ActionAttemptKind",
  ADD COLUMN "lifecycleVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "outcomeCode" TEXT,
  ADD COLUMN "payloadRetentionUntil" TIMESTAMP(3),
  ADD COLUMN "providerIdempotencyKeyHash" TEXT,
  ADD COLUMN "providerReferenceEncrypted" TEXT,
  ADD COLUMN "providerReferenceHash" TEXT,
  ADD COLUMN "providerRequestIdentityHash" TEXT,
  ADD COLUMN "reconciliationRequired" BOOLEAN,
  ADD COLUMN "responseReceivedAt" TIMESTAMP(3),
  ADD COLUMN "retryDecisionCode" TEXT,
  ADD COLUMN "state" "ActionAttemptState";

-- Campaign becomes the shared SINGLE/BULK communication envelope.
ALTER TABLE "MarketingCampaign"
  ADD COLUMN "actionExecutionId" TEXT,
  ADD COLUMN "aggregateState" "CommunicationCampaignState",
  ADD COLUMN "auditRetentionUntil" TIMESTAMP(3),
  ADD COLUMN "contentRef" TEXT,
  ADD COLUMN "deliveryCapabilityKey" TEXT,
  ADD COLUMN "deliveryCapabilityVersion" INTEGER,
  ADD COLUMN "leaseTokenHash" TEXT,
  ADD COLUMN "lifecycleVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "payloadRetentionUntil" TIMESTAMP(3),
  ADD COLUMN "reconciliationPolicyKey" TEXT,
  ADD COLUMN "reconciliationPolicyVersion" INTEGER,
  ADD COLUMN "retryPolicyKey" TEXT,
  ADD COLUMN "retryPolicyVersion" INTEGER,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "scope" "CommunicationScope",
  ALTER COLUMN "createdByUserId" DROP NOT NULL,
  ALTER COLUMN "audienceId" DROP NOT NULL;

-- Durable identity, claim and reconciliation lookup paths.
CREATE INDEX "MarketingCampaignRecipient_tenantId_campaignId_deliveryStat_idx"
  ON "MarketingCampaignRecipient"("tenantId", "campaignId", "deliveryState", "nextAttemptAt");
CREATE INDEX "MarketingCampaignRecipient_tenantId_reconciliationState_lea_idx"
  ON "MarketingCampaignRecipient"("tenantId", "reconciliationState", "leaseExpiresAt");
CREATE UNIQUE INDEX "MarketingCampaignRecipient_id_tenantId_campaignId_key"
  ON "MarketingCampaignRecipient"("id", "tenantId", "campaignId");
CREATE UNIQUE INDEX "MarketingConsentEvidence_id_tenantId_key"
  ON "MarketingConsentEvidence"("id", "tenantId");
CREATE INDEX "MarketingDeliveryAttempt_tenantId_state_startedAt_idx"
  ON "MarketingDeliveryAttempt"("tenantId", "state", "startedAt");
CREATE INDEX "MarketingDeliveryAttempt_tenantId_providerReferenceHash_idx"
  ON "MarketingDeliveryAttempt"("tenantId", "providerReferenceHash");
CREATE UNIQUE INDEX "MarketingDeliveryAttempt_tenantId_recipientId_attemptNumber_key"
  ON "MarketingDeliveryAttempt"("tenantId", "recipientId", "attemptNumber");
CREATE INDEX "MarketingCampaign_tenantId_aggregateState_scheduledFor_leas_idx"
  ON "MarketingCampaign"("tenantId", "aggregateState", "scheduledFor", "leaseExpiresAt");
CREATE UNIQUE INDEX "MarketingCampaign_actionExecutionId_tenantId_key"
  ON "MarketingCampaign"("actionExecutionId", "tenantId");

-- Tenant-qualified references. These are database barriers, not service filters.
-- Legacy lifecycle-v0 rows can contain historical user/reference ids that were
-- never membership-qualified. NOT VALID preserves that evidence without a fake
-- backfill while PostgreSQL still enforces every new or changed reference.
ALTER TABLE "MarketingCampaignRecipient"
  ADD CONSTRAINT "MarketingCampaignRecipient_internalUserId_tenantId_fkey"
  FOREIGN KEY ("internalUserId", "tenantId")
  REFERENCES "Membership"("userId", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "MarketingCampaignRecipient"
  ADD CONSTRAINT "MarketingCampaignRecipient_consentEvidenceId_tenantId_fkey"
  FOREIGN KEY ("consentEvidenceId", "tenantId")
  REFERENCES "MarketingConsentEvidence"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketingDeliveryAttempt"
  ADD CONSTRAINT "MarketingDeliveryAttempt_recipientId_tenantId_campaignId_fkey"
  FOREIGN KEY ("recipientId", "tenantId", "campaignId")
  REFERENCES "MarketingCampaignRecipient"("id", "tenantId", "campaignId")
  ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

ALTER TABLE "MarketingCampaign"
  ADD CONSTRAINT "MarketingCampaign_actionExecutionId_tenantId_fkey"
  FOREIGN KEY ("actionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MarketingCampaign"
  ADD CONSTRAINT "MarketingCampaign_audienceId_tenantId_fkey"
  FOREIGN KEY ("audienceId", "tenantId")
  REFERENCES "MarketingAudience"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "MarketingCampaign"
  ADD CONSTRAINT "MarketingCampaign_createdByUserId_tenantId_fkey"
  FOREIGN KEY ("createdByUserId", "tenantId")
  REFERENCES "Membership"("userId", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "MarketingCampaign"
  ADD CONSTRAINT "MarketingCampaign_confirmedByUserId_tenantId_fkey"
  FOREIGN KEY ("confirmedByUserId", "tenantId")
  REFERENCES "Membership"("userId", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- Version-gated invariants keep lifecycle-v0 rows untouched and make every new
-- lifecycle-v1 row self-consistent at the database boundary.
ALTER TABLE "MarketingCampaign"
  ADD CONSTRAINT "MarketingCampaign_lifecycle_v1_complete_check" CHECK (
    "lifecycleVersion" = 0 OR (
      "lifecycleVersion" = 1
      AND "scope" IS NOT NULL
      AND "actionExecutionId" IS NOT NULL
      AND "aggregateState" IS NOT NULL
      AND "contentRef" IS NOT NULL AND length(btrim("contentRef")) > 0
      AND "messageSnapshotHash" <> ''
      AND "idempotencyKey" IS NOT NULL AND length(btrim("idempotencyKey")) > 0
      AND "deliveryCapabilityKey" IS NOT NULL AND length(btrim("deliveryCapabilityKey")) > 0
      AND "deliveryCapabilityVersion" IS NOT NULL AND "deliveryCapabilityVersion" > 0
      AND "retryPolicyKey" IS NOT NULL AND length(btrim("retryPolicyKey")) > 0
      AND "retryPolicyVersion" IS NOT NULL AND "retryPolicyVersion" > 0
      AND "reconciliationPolicyKey" IS NOT NULL AND length(btrim("reconciliationPolicyKey")) > 0
      AND "reconciliationPolicyVersion" IS NOT NULL AND "reconciliationPolicyVersion" > 0
    )
  );

ALTER TABLE "MarketingCampaign"
  ADD CONSTRAINT "MarketingCampaign_scope_check" CHECK (
    "lifecycleVersion" = 0
    OR ("scope" = 'SINGLE' AND "audienceId" IS NULL)
    OR ("scope" = 'BULK' AND "audienceId" IS NOT NULL AND "audienceSnapshotHash" <> '')
  );

ALTER TABLE "MarketingCampaign"
  ADD CONSTRAINT "MarketingCampaign_lease_tuple_check" CHECK (
    ("leaseOwner" IS NULL AND "leaseTokenHash" IS NULL AND "leaseExpiresAt" IS NULL)
    OR ("leaseOwner" IS NOT NULL AND "leaseTokenHash" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
  );

ALTER TABLE "MarketingCampaignRecipient"
  ADD CONSTRAINT "MarketingCampaignRecipient_lifecycle_v1_complete_check" CHECK (
    "lifecycleVersion" = 0 OR (
      "lifecycleVersion" = 1
      AND "identityVersion" IS NOT NULL AND "identityVersion" > 0
      AND "recipientKind" IS NOT NULL AND length(btrim("recipientKind")) > 0
      AND "recipientRefHash" IS NOT NULL AND length(btrim("recipientRefHash")) > 0
      AND "contentIdentityHash" IS NOT NULL AND length(btrim("contentIdentityHash")) > 0
      AND "deliveryState" IS NOT NULL
      AND "externalDispatchState" IS NOT NULL
      AND "reconciliationState" IS NOT NULL
      AND "eligibilityBasis" IS NOT NULL AND length(btrim("eligibilityBasis")) > 0
      AND "eligibilityDecision" IN ('ALLOW', 'SKIP', 'DENY')
      AND "eligibilityPolicyVersion" IS NOT NULL AND "eligibilityPolicyVersion" > 0
      AND "eligibilityEvidenceRef" IS NOT NULL AND length(btrim("eligibilityEvidenceRef")) > 0
      AND "eligibilityEvidenceHash" IS NOT NULL AND length(btrim("eligibilityEvidenceHash")) > 0
      AND "eligibilityCheckedAt" IS NOT NULL
    )
  );

ALTER TABLE "MarketingCampaignRecipient"
  ADD CONSTRAINT "MarketingCampaignRecipient_lease_tuple_check" CHECK (
    ("leaseOwner" IS NULL AND "leaseTokenHash" IS NULL AND "leaseExpiresAt" IS NULL)
    OR ("leaseOwner" IS NOT NULL AND "leaseTokenHash" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
  );

ALTER TABLE "MarketingCampaignRecipient"
  ADD CONSTRAINT "MarketingCampaignRecipient_unknown_check" CHECK (
    "lifecycleVersion" = 0 OR "deliveryState" <> 'UNKNOWN' OR (
      "externalDispatchState" = 'MAY_HAVE_CROSSED'
      AND "reconciliationState" <> 'NOT_REQUIRED'
      AND "nextAttemptAt" IS NULL
      AND "unknownAt" IS NOT NULL
      AND "terminalAt" IS NULL
    )
  );

ALTER TABLE "MarketingCampaignRecipient"
  ADD CONSTRAINT "MarketingCampaignRecipient_terminal_check" CHECK (
    "lifecycleVersion" = 0 OR (
      ("terminalAt" IS NULL OR (
        "deliveryState" IN ('ACCEPTED', 'DELIVERED', 'FAILED', 'SKIPPED')
        AND "leaseOwner" IS NULL AND "leaseTokenHash" IS NULL AND "leaseExpiresAt" IS NULL
      ))
      AND ("deliveryState" NOT IN ('DELIVERED', 'FAILED', 'SKIPPED') OR "terminalAt" IS NOT NULL)
      AND ("deliveryState" NOT IN ('NOT_SENT', 'UNKNOWN') OR "terminalAt" IS NULL)
    )
  );

ALTER TABLE "MarketingCampaignRecipient"
  ADD CONSTRAINT "MarketingCampaignRecipient_outcome_timestamps_check" CHECK (
    "lifecycleVersion" = 0 OR (
      ("deliveryState" <> 'ACCEPTED' OR "acceptedAt" IS NOT NULL)
      AND ("deliveryState" <> 'DELIVERED' OR "deliveredAt" IS NOT NULL)
      AND ("deliveryState" <> 'FAILED' OR "failedAt" IS NOT NULL)
      AND ("nextAttemptAt" IS NULL OR "deliveryState" = 'NOT_SENT')
    )
  );

ALTER TABLE "MarketingDeliveryAttempt"
  ADD CONSTRAINT "MarketingDeliveryAttempt_lifecycle_v1_complete_check" CHECK (
    "lifecycleVersion" = 0 OR (
      "lifecycleVersion" = 1
      AND "recipientId" IS NOT NULL
      AND "kind" IS NOT NULL
      AND "state" IS NOT NULL
      AND "externalDispatchState" IS NOT NULL
      AND "reconciliationRequired" IS NOT NULL
      AND "attemptNumber" >= 1
    )
  );

ALTER TABLE "MarketingDeliveryAttempt"
  ADD CONSTRAINT "MarketingDeliveryAttempt_unknown_check" CHECK (
    "lifecycleVersion" = 0 OR "state" <> 'UNKNOWN' OR (
      "externalDispatchState" = 'MAY_HAVE_CROSSED'
      AND "reconciliationRequired" = true
    )
  );

ALTER TABLE "MarketingDeliveryAttempt"
  ADD CONSTRAINT "MarketingDeliveryAttempt_completion_check" CHECK (
    "lifecycleVersion" = 0 OR (
      ("state" = 'STARTED' AND "completedAt" IS NULL)
      OR ("state" IN ('SUCCEEDED', 'FAILED', 'UNKNOWN') AND "completedAt" IS NOT NULL)
    )
  );
