-- Chapter 6 Phase B1 durable execution kernel.
-- Additive only: no legacy approval/tool rows are backfilled and no existing
-- production execution owner is connected by this migration.

CREATE TYPE "ActionExecutionState" AS ENUM (
  'PENDING_APPROVAL',
  'READY',
  'EXECUTING',
  'UNKNOWN',
  'SUCCEEDED',
  'FAILED',
  'NOT_EXECUTED'
);

CREATE TYPE "ActionPolicyDecision" AS ENUM (
  'ALLOW',
  'DENY',
  'SHADOW_ONLY'
);

CREATE TYPE "ActionApprovalDecision" AS ENUM (
  'NOT_REQUIRED',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED'
);

CREATE TYPE "ActionReconciliationState" AS ENUM (
  'NOT_REQUIRED',
  'REQUIRED',
  'IN_PROGRESS',
  'RESOLVED',
  'MANUAL_REQUIRED'
);

CREATE TYPE "ActionAttemptKind" AS ENUM ('EXECUTION', 'RECONCILIATION');

CREATE TYPE "ActionAttemptState" AS ENUM (
  'STARTED',
  'SUCCEEDED',
  'FAILED',
  'UNKNOWN'
);

CREATE TYPE "ExternalDispatchState" AS ENUM (
  'NOT_APPLICABLE',
  'NOT_CROSSED',
  'MAY_HAVE_CROSSED',
  'ACKNOWLEDGED'
);

CREATE TABLE "ActionExecution" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "identityVersion" INTEGER NOT NULL,
  "identityFingerprint" TEXT NOT NULL,
  "idempotencyScope" TEXT,
  "requestIdempotencyKeyHash" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceRef" TEXT,
  "agentTaskId" TEXT,
  "actorUserId" TEXT,
  "actionClass" TEXT NOT NULL,
  "capability" TEXT NOT NULL,
  "capabilityVersion" INTEGER NOT NULL,
  "targetKind" TEXT NOT NULL,
  "targetRef" TEXT NOT NULL,
  "normalizedInputContract" TEXT NOT NULL,
  "normalizedInputHash" TEXT NOT NULL,
  "normalizedInputEncrypted" TEXT,
  "evidenceRefsJson" JSONB NOT NULL,
  "intentExpiresAt" TIMESTAMP(3),
  "dryRun" BOOLEAN NOT NULL DEFAULT false,
  "riskProfileVersion" INTEGER NOT NULL,
  "riskFacetsJson" JSONB NOT NULL,
  "policyKey" TEXT NOT NULL,
  "policyVersion" INTEGER NOT NULL,
  "policyDecision" "ActionPolicyDecision" NOT NULL,
  "autonomyLevel" TEXT NOT NULL,
  "policyDecidedBy" TEXT NOT NULL,
  "approvalRequirement" TEXT NOT NULL,
  "approvalDecision" "ActionApprovalDecision" NOT NULL,
  "approvalInputHash" TEXT,
  "approvalRequestedAt" TIMESTAMP(3),
  "approvalExpiresAt" TIMESTAMP(3),
  "approvalDecidedAt" TIMESTAMP(3),
  "approvalDecidedByUserId" TEXT,
  "state" "ActionExecutionState" NOT NULL,
  "notExecutedReasonCode" TEXT,
  "retryPolicyKey" TEXT NOT NULL,
  "retryPolicyVersion" INTEGER NOT NULL,
  "maxExecutionAttempts" INTEGER NOT NULL,
  "executionAttemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextExecutionAttemptAt" TIMESTAMP(3),
  "reconciliationPolicyKey" TEXT NOT NULL,
  "reconciliationPolicyVersion" INTEGER NOT NULL,
  "reconciliationState" "ActionReconciliationState" NOT NULL,
  "leaseOwner" TEXT,
  "leaseTokenHash" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 0,
  "transportIdentityVersion" INTEGER NOT NULL,
  "transportIdempotencyKey" TEXT NOT NULL,
  "finalOutcomeCode" TEXT,
  "safeResultSummaryJson" JSONB,
  "userExplanationCode" TEXT,
  "userExplanationParamsJson" JSONB,
  "firstAttemptedAt" TIMESTAMP(3),
  "finalizedAt" TIMESTAMP(3),
  "payloadRetentionUntil" TIMESTAMP(3),
  "auditRetentionUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ActionExecution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActionExecution_positive_versions_check" CHECK (
    "identityVersion" > 0
    AND "capabilityVersion" > 0
    AND "riskProfileVersion" > 0
    AND "policyVersion" > 0
    AND "retryPolicyVersion" > 0
    AND "reconciliationPolicyVersion" > 0
    AND "transportIdentityVersion" > 0
    AND "maxExecutionAttempts" > 0
    AND "executionAttemptCount" >= 0
    AND "executionAttemptCount" <= "maxExecutionAttempts"
    AND "revision" >= 0
  ),
  CONSTRAINT "ActionExecution_nonblank_contract_check" CHECK (
    btrim("identityFingerprint") <> ''
    AND btrim("sourceType") <> ''
    AND btrim("actionClass") <> ''
    AND btrim("capability") <> ''
    AND btrim("targetKind") <> ''
    AND btrim("targetRef") <> ''
    AND btrim("normalizedInputContract") <> ''
    AND btrim("normalizedInputHash") <> ''
    AND btrim("policyKey") <> ''
    AND btrim("policyDecidedBy") <> ''
    AND btrim("retryPolicyKey") <> ''
    AND btrim("reconciliationPolicyKey") <> ''
    AND btrim("transportIdempotencyKey") <> ''
  ),
  CONSTRAINT "ActionExecution_source_shape_check" CHECK (
    "sourceType" IN (
      'agent_task',
      'authenticated_request',
      'scheduler',
      'webhook',
      'legacy_bridge',
      'synthetic_shadow'
    )
    AND (
      (
        "sourceType" = 'agent_task'
        AND "agentTaskId" IS NOT NULL
        AND "sourceRef" = "agentTaskId"
      )
      OR ("sourceType" <> 'agent_task' AND "agentTaskId" IS NULL)
    )
  ),
  CONSTRAINT "ActionExecution_idempotency_pair_check" CHECK (
    ("idempotencyScope" IS NULL) = ("requestIdempotencyKeyHash" IS NULL)
  ),
  CONSTRAINT "ActionExecution_json_shape_check" CHECK (
    jsonb_typeof("evidenceRefsJson") = 'array'
    AND jsonb_typeof("riskFacetsJson") = 'array'
  ),
  CONSTRAINT "ActionExecution_approval_hash_check" CHECK (
    "approvalInputHash" IS NULL
    OR "approvalInputHash" = "normalizedInputHash"
  ),
  CONSTRAINT "ActionExecution_approval_shape_check" CHECK (
    (
      "approvalRequirement" = 'NONE'
      AND "approvalDecision" = 'NOT_REQUIRED'
      AND "approvalInputHash" IS NULL
      AND "approvalRequestedAt" IS NULL
      AND "approvalExpiresAt" IS NULL
      AND "approvalDecidedAt" IS NULL
      AND "approvalDecidedByUserId" IS NULL
    )
    OR (
      "approvalRequirement" = 'REQUIRED'
      AND "approvalInputHash" = "normalizedInputHash"
      AND "approvalRequestedAt" IS NOT NULL
      AND "approvalExpiresAt" IS NOT NULL
      AND "approvalExpiresAt" > "approvalRequestedAt"
      AND (
        (
          "approvalDecision" = 'PENDING'
          AND "approvalDecidedAt" IS NULL
          AND "approvalDecidedByUserId" IS NULL
        )
        OR (
          "approvalDecision" IN ('APPROVED', 'REJECTED')
          AND "approvalDecidedAt" IS NOT NULL
          AND "approvalDecidedByUserId" IS NOT NULL
          AND "approvalDecidedAt" <= "approvalExpiresAt"
        )
        OR (
          "approvalDecision" = 'EXPIRED'
          AND "approvalDecidedAt" IS NOT NULL
        )
      )
    )
  ),
  CONSTRAINT "ActionExecution_lease_tuple_check" CHECK (
    ("leaseOwner" IS NULL)
      = ("leaseTokenHash" IS NULL)
    AND ("leaseOwner" IS NULL)
      = ("leaseExpiresAt" IS NULL)
  ),
  CONSTRAINT "ActionExecution_retention_clock_check" CHECK (
    ("payloadRetentionUntil" IS NULL OR "payloadRetentionUntil" >= "createdAt")
    AND ("auditRetentionUntil" IS NULL OR "auditRetentionUntil" >= "createdAt")
    AND (
      "payloadRetentionUntil" IS NULL
      OR "auditRetentionUntil" IS NULL
      OR "auditRetentionUntil" >= "payloadRetentionUntil"
    )
  ),
  CONSTRAINT "ActionExecution_policy_shape_check" CHECK (
    (
      "policyDecision" = 'ALLOW'
    )
    OR (
      "policyDecision" IN ('DENY', 'SHADOW_ONLY')
      AND "state" = 'NOT_EXECUTED'
      AND "executionAttemptCount" = 0
      AND "firstAttemptedAt" IS NULL
      AND "reconciliationState" = 'NOT_REQUIRED'
    )
  ),
  CONSTRAINT "ActionExecution_state_shape_check" CHECK (
    (
      "state" = 'PENDING_APPROVAL'
      AND "policyDecision" = 'ALLOW'
      AND "approvalDecision" = 'PENDING'
      AND "executionAttemptCount" = 0
      AND "firstAttemptedAt" IS NULL
      AND "finalizedAt" IS NULL
      AND "finalOutcomeCode" IS NULL
      AND "notExecutedReasonCode" IS NULL
      AND "leaseOwner" IS NULL
      AND "reconciliationState" = 'NOT_REQUIRED'
    )
    OR (
      "state" = 'READY'
      AND "policyDecision" = 'ALLOW'
      AND "approvalDecision" IN ('NOT_REQUIRED', 'APPROVED')
      AND "finalizedAt" IS NULL
      AND "finalOutcomeCode" IS NULL
      AND "notExecutedReasonCode" IS NULL
      AND "leaseOwner" IS NULL
      AND "reconciliationState" IN ('NOT_REQUIRED', 'RESOLVED')
    )
    OR (
      "state" = 'EXECUTING'
      AND "policyDecision" = 'ALLOW'
      AND "approvalDecision" IN ('NOT_REQUIRED', 'APPROVED')
      AND "executionAttemptCount" > 0
      AND "firstAttemptedAt" IS NOT NULL
      AND "finalizedAt" IS NULL
      AND "notExecutedReasonCode" IS NULL
      AND "leaseOwner" IS NOT NULL
      AND "reconciliationState" = 'NOT_REQUIRED'
    )
    OR (
      "state" = 'UNKNOWN'
      AND "executionAttemptCount" > 0
      AND "firstAttemptedAt" IS NOT NULL
      AND "finalizedAt" IS NULL
      AND "finalOutcomeCode" IS NULL
      AND "notExecutedReasonCode" IS NULL
      AND (
        (
          "reconciliationState" IN ('REQUIRED', 'MANUAL_REQUIRED')
          AND "leaseOwner" IS NULL
        )
        OR (
          "reconciliationState" = 'IN_PROGRESS'
          AND "leaseOwner" IS NOT NULL
        )
      )
    )
    OR (
      "state" IN ('SUCCEEDED', 'FAILED')
      AND "executionAttemptCount" > 0
      AND "firstAttemptedAt" IS NOT NULL
      AND "finalizedAt" IS NOT NULL
      AND "finalOutcomeCode" IS NOT NULL
      AND "notExecutedReasonCode" IS NULL
      AND "leaseOwner" IS NULL
      AND "reconciliationState" IN ('NOT_REQUIRED', 'RESOLVED')
    )
    OR (
      "state" = 'NOT_EXECUTED'
      AND "finalizedAt" IS NOT NULL
      AND "notExecutedReasonCode" IS NOT NULL
      AND "leaseOwner" IS NULL
      AND "reconciliationState" IN ('NOT_REQUIRED', 'RESOLVED', 'MANUAL_REQUIRED')
    )
  ),
  CONSTRAINT "ActionExecution_shadow_shape_check" CHECK (
    "policyDecision" <> 'SHADOW_ONLY'
    OR (
      "state" = 'NOT_EXECUTED'
      AND "dryRun" = true
      AND "executionAttemptCount" = 0
      AND "finalOutcomeCode" IS NULL
      AND "notExecutedReasonCode" = 'shadow_only'
    )
  )
);

CREATE TABLE "ActionAttempt" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actionExecutionId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "kind" "ActionAttemptKind" NOT NULL,
  "state" "ActionAttemptState" NOT NULL,
  "executorKey" TEXT NOT NULL,
  "executorVersion" INTEGER NOT NULL,
  "externalDispatchState" "ExternalDispatchState" NOT NULL,
  "providerRequestIdentityHash" TEXT,
  "providerReferenceEncrypted" TEXT,
  "providerReferenceHash" TEXT,
  "transportCode" TEXT,
  "httpStatus" INTEGER,
  "errorClass" TEXT,
  "outcomeCode" TEXT,
  "safeResultJson" JSONB,
  "retryDecisionCode" TEXT,
  "reconciliationRequired" BOOLEAN NOT NULL DEFAULT false,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ActionAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActionAttempt_positive_values_check" CHECK (
    "attemptNumber" > 0
    AND "executorVersion" > 0
    AND ("httpStatus" IS NULL OR "httpStatus" BETWEEN 100 AND 599)
    AND btrim("executorKey") <> ''
  ),
  CONSTRAINT "ActionAttempt_kind_dispatch_check" CHECK (
    (
      "kind" = 'EXECUTION'
      AND "externalDispatchState" <> 'NOT_APPLICABLE'
    )
    OR (
      "kind" = 'RECONCILIATION'
      AND "externalDispatchState" = 'NOT_APPLICABLE'
      AND "providerRequestIdentityHash" IS NULL
    )
  ),
  CONSTRAINT "ActionAttempt_state_shape_check" CHECK (
    (
      "state" = 'STARTED'
      AND "finishedAt" IS NULL
      AND "outcomeCode" IS NULL
      AND "errorClass" IS NULL
      AND "retryDecisionCode" IS NULL
      AND "reconciliationRequired" = false
    )
    OR (
      "state" = 'SUCCEEDED'
      AND "finishedAt" IS NOT NULL
      AND "outcomeCode" IS NOT NULL
      AND "errorClass" IS NULL
    )
    OR (
      "state" = 'FAILED'
      AND "finishedAt" IS NOT NULL
      AND "errorClass" IS NOT NULL
    )
    OR (
      "state" = 'UNKNOWN'
      AND "finishedAt" IS NOT NULL
      AND "outcomeCode" IS NOT NULL
      AND "reconciliationRequired" = true
    )
  ),
  CONSTRAINT "ActionAttempt_unknown_dispatch_check" CHECK (
    "state" <> 'UNKNOWN'
    OR "kind" = 'RECONCILIATION'
    OR "externalDispatchState" IN ('MAY_HAVE_CROSSED', 'ACKNOWLEDGED')
  )
);

CREATE UNIQUE INDEX "ActionExecution_id_tenantId_key"
  ON "ActionExecution" ("id", "tenantId");
CREATE UNIQUE INDEX "ActionExecution_tenantId_identityFingerprint_key"
  ON "ActionExecution" ("tenantId", "identityFingerprint");
CREATE UNIQUE INDEX "ActionExecution_tenant_idempotency_key"
  ON "ActionExecution" (
    "tenantId",
    "idempotencyScope",
    "requestIdempotencyKeyHash"
  );
CREATE INDEX "ActionExecution_tenantId_state_nextExecutionAttemptAt_idx"
  ON "ActionExecution" ("tenantId", "state", "nextExecutionAttemptAt");
CREATE INDEX "ActionExecution_tenantId_reconciliationState_leaseExpiresAt_idx"
  ON "ActionExecution" (
    "tenantId",
    "reconciliationState",
    "leaseExpiresAt"
  );
CREATE INDEX "ActionExecution_tenantId_agentTaskId_idx"
  ON "ActionExecution" ("tenantId", "agentTaskId");
CREATE INDEX "ActionExecution_tenantId_createdAt_idx"
  ON "ActionExecution" ("tenantId", "createdAt");

CREATE UNIQUE INDEX "ActionAttempt_id_tenantId_key"
  ON "ActionAttempt" ("id", "tenantId");
CREATE UNIQUE INDEX "ActionAttempt_tenantId_actionExecutionId_attemptNumber_key"
  ON "ActionAttempt" ("tenantId", "actionExecutionId", "attemptNumber");
CREATE UNIQUE INDEX "ActionAttempt_one_open_per_execution"
  ON "ActionAttempt" ("tenantId", "actionExecutionId")
  WHERE "state" = 'STARTED';
CREATE INDEX "ActionAttempt_tenantId_state_startedAt_idx"
  ON "ActionAttempt" ("tenantId", "state", "startedAt");
CREATE INDEX "ActionAttempt_tenantId_providerReferenceHash_idx"
  ON "ActionAttempt" ("tenantId", "providerReferenceHash");

ALTER TABLE "ActionExecution"
  ADD CONSTRAINT "ActionExecution_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActionExecution"
  ADD CONSTRAINT "ActionExecution_agentTaskId_tenantId_fkey"
  FOREIGN KEY ("agentTaskId", "tenantId") REFERENCES "AgentTask" ("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ActionExecution"
  ADD CONSTRAINT "ActionExecution_actorUserId_tenantId_fkey"
  FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "Membership" ("userId", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ActionExecution"
  ADD CONSTRAINT "ActionExecution_approvalDecidedByUserId_tenantId_fkey"
  FOREIGN KEY ("approvalDecidedByUserId", "tenantId") REFERENCES "Membership" ("userId", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ActionAttempt"
  ADD CONSTRAINT "ActionAttempt_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActionAttempt"
  ADD CONSTRAINT "ActionAttempt_actionExecutionId_tenantId_fkey"
  FOREIGN KEY ("actionExecutionId", "tenantId") REFERENCES "ActionExecution" ("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION "guard_action_attempt_insert"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  execution_row "ActionExecution"%ROWTYPE;
  expected_number INTEGER;
BEGIN
  SELECT * INTO execution_row
  FROM "ActionExecution"
  WHERE "id" = NEW."actionExecutionId"
    AND "tenantId" = NEW."tenantId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ActionAttempt execution is missing or cross-tenant'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(MAX("attemptNumber"), 0) + 1 INTO expected_number
  FROM "ActionAttempt"
  WHERE "tenantId" = NEW."tenantId"
    AND "actionExecutionId" = NEW."actionExecutionId";

  IF NEW."attemptNumber" <> expected_number THEN
    RAISE EXCEPTION 'ActionAttempt number must be the next durable sequence'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."kind" = 'EXECUTION' AND execution_row."state" <> 'READY' THEN
    RAISE EXCEPTION 'Execution attempt requires READY ActionExecution'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."kind" = 'RECONCILIATION' AND (
    execution_row."state" <> 'UNKNOWN'
    OR execution_row."reconciliationState" <> 'REQUIRED'
  ) THEN
    RAISE EXCEPTION 'Reconciliation attempt requires UNKNOWN/REQUIRED execution'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ActionAttempt_insert_guard"
BEFORE INSERT ON "ActionAttempt"
FOR EACH ROW EXECUTE FUNCTION "guard_action_attempt_insert"();

CREATE FUNCTION "guard_action_attempt_transition"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."actionExecutionId" IS DISTINCT FROM OLD."actionExecutionId"
    OR NEW."attemptNumber" IS DISTINCT FROM OLD."attemptNumber"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."executorKey" IS DISTINCT FROM OLD."executorKey"
    OR NEW."executorVersion" IS DISTINCT FROM OLD."executorVersion"
    OR NEW."startedAt" IS DISTINCT FROM OLD."startedAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'ActionAttempt identity fields are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."state" <> 'STARTED' THEN
    RAISE EXCEPTION 'Finished ActionAttempt is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."state" = 'STARTED' THEN
    IF OLD."externalDispatchState" = 'NOT_CROSSED'
      AND NEW."externalDispatchState" NOT IN (
        'NOT_CROSSED',
        'MAY_HAVE_CROSSED'
      )
    THEN
      RAISE EXCEPTION 'Execution dispatch boundary transition is invalid'
        USING ERRCODE = '23514';
    END IF;
    IF OLD."externalDispatchState" = 'MAY_HAVE_CROSSED'
      AND NEW."externalDispatchState" NOT IN (
        'MAY_HAVE_CROSSED',
        'ACKNOWLEDGED'
      )
    THEN
      RAISE EXCEPTION 'Execution dispatch acknowledgement transition is invalid'
        USING ERRCODE = '23514';
    END IF;
    IF OLD."externalDispatchState" IN ('ACKNOWLEDGED', 'NOT_APPLICABLE')
      AND NEW."externalDispatchState" IS DISTINCT FROM OLD."externalDispatchState"
    THEN
      RAISE EXCEPTION 'ActionAttempt dispatch state cannot move backwards'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."state" NOT IN ('SUCCEEDED', 'FAILED', 'UNKNOWN') THEN
    RAISE EXCEPTION 'Unsupported ActionAttempt transition'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ActionAttempt_transition_guard"
BEFORE UPDATE ON "ActionAttempt"
FOR EACH ROW EXECUTE FUNCTION "guard_action_attempt_transition"();

CREATE FUNCTION "guard_action_execution_transition"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  latest_attempt "ActionAttempt"%ROWTYPE;
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."identityVersion" IS DISTINCT FROM OLD."identityVersion"
    OR NEW."identityFingerprint" IS DISTINCT FROM OLD."identityFingerprint"
    OR NEW."idempotencyScope" IS DISTINCT FROM OLD."idempotencyScope"
    OR NEW."requestIdempotencyKeyHash" IS DISTINCT FROM OLD."requestIdempotencyKeyHash"
    OR NEW."sourceType" IS DISTINCT FROM OLD."sourceType"
    OR NEW."sourceRef" IS DISTINCT FROM OLD."sourceRef"
    OR NEW."agentTaskId" IS DISTINCT FROM OLD."agentTaskId"
    OR NEW."actorUserId" IS DISTINCT FROM OLD."actorUserId"
    OR NEW."actionClass" IS DISTINCT FROM OLD."actionClass"
    OR NEW."capability" IS DISTINCT FROM OLD."capability"
    OR NEW."capabilityVersion" IS DISTINCT FROM OLD."capabilityVersion"
    OR NEW."targetKind" IS DISTINCT FROM OLD."targetKind"
    OR NEW."targetRef" IS DISTINCT FROM OLD."targetRef"
    OR NEW."normalizedInputContract" IS DISTINCT FROM OLD."normalizedInputContract"
    OR NEW."normalizedInputHash" IS DISTINCT FROM OLD."normalizedInputHash"
    OR NEW."normalizedInputEncrypted" IS DISTINCT FROM OLD."normalizedInputEncrypted"
    OR NEW."evidenceRefsJson" IS DISTINCT FROM OLD."evidenceRefsJson"
    OR NEW."intentExpiresAt" IS DISTINCT FROM OLD."intentExpiresAt"
    OR NEW."dryRun" IS DISTINCT FROM OLD."dryRun"
    OR NEW."riskProfileVersion" IS DISTINCT FROM OLD."riskProfileVersion"
    OR NEW."riskFacetsJson" IS DISTINCT FROM OLD."riskFacetsJson"
    OR NEW."policyKey" IS DISTINCT FROM OLD."policyKey"
    OR NEW."policyVersion" IS DISTINCT FROM OLD."policyVersion"
    OR NEW."policyDecision" IS DISTINCT FROM OLD."policyDecision"
    OR NEW."autonomyLevel" IS DISTINCT FROM OLD."autonomyLevel"
    OR NEW."policyDecidedBy" IS DISTINCT FROM OLD."policyDecidedBy"
    OR NEW."approvalRequirement" IS DISTINCT FROM OLD."approvalRequirement"
    OR NEW."approvalInputHash" IS DISTINCT FROM OLD."approvalInputHash"
    OR NEW."approvalRequestedAt" IS DISTINCT FROM OLD."approvalRequestedAt"
    OR NEW."approvalExpiresAt" IS DISTINCT FROM OLD."approvalExpiresAt"
    OR NEW."retryPolicyKey" IS DISTINCT FROM OLD."retryPolicyKey"
    OR NEW."retryPolicyVersion" IS DISTINCT FROM OLD."retryPolicyVersion"
    OR NEW."maxExecutionAttempts" IS DISTINCT FROM OLD."maxExecutionAttempts"
    OR NEW."reconciliationPolicyKey" IS DISTINCT FROM OLD."reconciliationPolicyKey"
    OR NEW."reconciliationPolicyVersion" IS DISTINCT FROM OLD."reconciliationPolicyVersion"
    OR NEW."transportIdentityVersion" IS DISTINCT FROM OLD."transportIdentityVersion"
    OR NEW."transportIdempotencyKey" IS DISTINCT FROM OLD."transportIdempotencyKey"
    OR NEW."payloadRetentionUntil" IS DISTINCT FROM OLD."payloadRetentionUntil"
    OR NEW."auditRetentionUntil" IS DISTINCT FROM OLD."auditRetentionUntil"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'ActionExecution immutable contract fields changed'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."state" IN ('SUCCEEDED', 'FAILED', 'NOT_EXECUTED') THEN
    RAISE EXCEPTION 'Terminal ActionExecution is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."executionAttemptCount" < OLD."executionAttemptCount"
    OR NEW."revision" <= OLD."revision"
  THEN
    RAISE EXCEPTION 'ActionExecution counters/revision cannot move backwards'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."approvalDecision" <> NEW."approvalDecision" AND NOT (
    OLD."state" = 'PENDING_APPROVAL'
    AND OLD."approvalDecision" = 'PENDING'
    AND NEW."approvalDecision" IN ('APPROVED', 'REJECTED', 'EXPIRED')
  ) THEN
    RAISE EXCEPTION 'Unsupported approval transition'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO latest_attempt
  FROM "ActionAttempt"
  WHERE "tenantId" = OLD."tenantId"
    AND "actionExecutionId" = OLD."id"
  ORDER BY "attemptNumber" DESC
  LIMIT 1;

  IF NEW."state" IS DISTINCT FROM OLD."state" THEN
    IF OLD."state" = 'PENDING_APPROVAL' AND NEW."state" = 'READY' THEN
      IF NEW."approvalDecision" <> 'APPROVED' THEN
        RAISE EXCEPTION 'Approval proof is required for READY'
          USING ERRCODE = '23514';
      END IF;
    ELSIF OLD."state" = 'PENDING_APPROVAL' AND NEW."state" = 'NOT_EXECUTED' THEN
      IF NEW."approvalDecision" NOT IN ('REJECTED', 'EXPIRED') THEN
        RAISE EXCEPTION 'Rejected or expired approval proof is required'
          USING ERRCODE = '23514';
      END IF;
    ELSIF OLD."state" = 'READY' AND NEW."state" = 'EXECUTING' THEN
      IF NOT FOUND
        OR latest_attempt."kind" <> 'EXECUTION'
        OR latest_attempt."state" <> 'STARTED'
      THEN
        RAISE EXCEPTION 'READY claim requires one open execution attempt'
          USING ERRCODE = '23514';
      END IF;
    ELSIF OLD."state" = 'EXECUTING' AND NEW."state" = 'READY' THEN
      IF NOT FOUND
        OR latest_attempt."kind" <> 'EXECUTION'
        OR latest_attempt."state" <> 'FAILED'
        OR latest_attempt."externalDispatchState" <> 'NOT_CROSSED'
        OR latest_attempt."retryDecisionCode" <> 'SAFE_RETRY_ALLOWED'
      THEN
        RAISE EXCEPTION 'Retry requires definitive pre-dispatch safe proof'
          USING ERRCODE = '23514';
      END IF;
    ELSIF OLD."state" = 'EXECUTING' AND NEW."state" = 'SUCCEEDED' THEN
      IF NOT FOUND
        OR latest_attempt."kind" <> 'EXECUTION'
        OR latest_attempt."state" <> 'SUCCEEDED'
      THEN
        RAISE EXCEPTION 'Success requires definitive execution attempt proof'
          USING ERRCODE = '23514';
      END IF;
    ELSIF OLD."state" = 'EXECUTING' AND NEW."state" = 'FAILED' THEN
      IF NOT FOUND
        OR latest_attempt."kind" <> 'EXECUTION'
        OR latest_attempt."state" <> 'FAILED'
      THEN
        RAISE EXCEPTION 'Failure requires definitive execution attempt proof'
          USING ERRCODE = '23514';
      END IF;
    ELSIF OLD."state" = 'EXECUTING' AND NEW."state" = 'UNKNOWN' THEN
      IF NOT FOUND
        OR latest_attempt."kind" <> 'EXECUTION'
        OR latest_attempt."state" <> 'UNKNOWN'
      THEN
        RAISE EXCEPTION 'UNKNOWN requires ambiguous execution attempt proof'
          USING ERRCODE = '23514';
      END IF;
    ELSIF OLD."state" = 'UNKNOWN' AND NEW."state" IN (
      'READY',
      'SUCCEEDED',
      'FAILED',
      'NOT_EXECUTED'
    ) THEN
      IF NOT FOUND
        OR latest_attempt."kind" <> 'RECONCILIATION'
        OR latest_attempt."state" <> 'SUCCEEDED'
      THEN
        RAISE EXCEPTION 'UNKNOWN resolution requires reconciliation proof'
          USING ERRCODE = '23514';
      END IF;
      IF NEW."state" = 'READY' AND (
        latest_attempt."outcomeCode" <> 'PROVEN_NOT_EXECUTED'
        OR latest_attempt."retryDecisionCode" <> 'SAFE_RETRY_ALLOWED'
      ) THEN
        RAISE EXCEPTION 'UNKNOWN cannot blind retry'
          USING ERRCODE = '23514';
      END IF;
      IF NEW."state" = 'SUCCEEDED'
        AND latest_attempt."outcomeCode" <> 'PROVEN_SUCCEEDED'
      THEN
        RAISE EXCEPTION 'Reconciliation success proof is missing'
          USING ERRCODE = '23514';
      END IF;
      IF NEW."state" = 'FAILED'
        AND latest_attempt."outcomeCode" <> 'PROVEN_FAILED'
      THEN
        RAISE EXCEPTION 'Reconciliation failure proof is missing'
          USING ERRCODE = '23514';
      END IF;
      IF NEW."state" = 'NOT_EXECUTED'
        AND latest_attempt."outcomeCode" <> 'PROVEN_NOT_EXECUTED'
      THEN
        RAISE EXCEPTION 'Non-execution proof is missing'
          USING ERRCODE = '23514';
      END IF;
    ELSE
      RAISE EXCEPTION 'Unsupported ActionExecution transition'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF OLD."state" = 'UNKNOWN'
    AND NEW."state" = 'UNKNOWN'
    AND OLD."reconciliationState" = 'REQUIRED'
    AND NEW."reconciliationState" = 'IN_PROGRESS'
  THEN
    IF NOT FOUND
      OR latest_attempt."kind" <> 'RECONCILIATION'
      OR latest_attempt."state" <> 'STARTED'
    THEN
      RAISE EXCEPTION 'Reconciliation claim requires one open attempt'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ActionExecution_transition_guard"
BEFORE UPDATE ON "ActionExecution"
FOR EACH ROW EXECUTE FUNCTION "guard_action_execution_transition"();
