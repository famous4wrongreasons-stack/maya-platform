-- Cycle 06 Blocking Package 5 common authority foundation.
-- Additive durable facts only: no historical business facts are fabricated.

-- ---------------------------------------------------------------------------
-- Shared governed-execution validator
-- ---------------------------------------------------------------------------

CREATE FUNCTION "p5_require_governed_execution"(
  checked_tenant_id TEXT,
  checked_execution_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  execution_row "ActionExecution"%ROWTYPE;
BEGIN
  SELECT *
  INTO execution_row
  FROM "ActionExecution"
  WHERE "id" = checked_execution_id
    AND "tenantId" = checked_tenant_id
  FOR KEY SHARE;

  IF NOT FOUND
    OR execution_row."dryRun"
    OR execution_row."policyDecision"::TEXT <> 'ALLOW'
    OR execution_row."approvalDecision"::TEXT NOT IN ('NOT_REQUIRED', 'APPROVED')
    OR execution_row."state"::TEXT NOT IN ('EXECUTING', 'SUCCEEDED')
  THEN
    RAISE EXCEPTION 'Package 5 mutation requires an executable tenant-qualified governed ActionExecution'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Common exact-target mutation fact
-- ---------------------------------------------------------------------------

CREATE TABLE "ActionTargetMutation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actionExecutionId" TEXT NOT NULL,
  "mutationKey" TEXT NOT NULL,
  "targetKind" TEXT NOT NULL,
  "targetRef" TEXT NOT NULL,
  "mutationKind" TEXT NOT NULL,
  "targetGeneration" INTEGER NOT NULL,
  "beforeStateHash" TEXT,
  "afterStateHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ActionTargetMutation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActionTargetMutation_generation_nonnegative_check"
    CHECK ("targetGeneration" >= 0),
  CONSTRAINT "ActionTargetMutation_identity_nonempty_check"
    CHECK (
      length(btrim("mutationKey")) > 0
      AND length(btrim("targetKind")) > 0
      AND length(btrim("targetRef")) > 0
      AND length(btrim("mutationKind")) > 0
    ),
  CONSTRAINT "ActionTargetMutation_state_hash_check"
    CHECK (
      ("beforeStateHash" IS NOT NULL OR "afterStateHash" IS NOT NULL)
      AND ("beforeStateHash" IS NULL OR "beforeStateHash" ~ '^[0-9a-f]{64}$')
      AND ("afterStateHash" IS NULL OR "afterStateHash" ~ '^[0-9a-f]{64}$')
    )
);

CREATE UNIQUE INDEX "ActionTargetMutation_id_tenantId_key"
  ON "ActionTargetMutation"("id", "tenantId");
CREATE UNIQUE INDEX "ActionTargetMutation_tenantId_actionExecutionId_mutationKey_key"
  ON "ActionTargetMutation"("tenantId", "actionExecutionId", "mutationKey");
CREATE UNIQUE INDEX "ActionTargetMutation_tenantId_targetKind_targetRef_targetGe_key"
  ON "ActionTargetMutation"("tenantId", "targetKind", "targetRef", "targetGeneration");
CREATE INDEX "ActionTargetMutation_tenantId_targetKind_targetRef_createdA_idx"
  ON "ActionTargetMutation"("tenantId", "targetKind", "targetRef", "createdAt");
CREATE INDEX "ActionTargetMutation_tenantId_actionExecutionId_idx"
  ON "ActionTargetMutation"("tenantId", "actionExecutionId");

ALTER TABLE "ActionTargetMutation"
  ADD CONSTRAINT "ActionTargetMutation_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionTargetMutation"
  ADD CONSTRAINT "ActionTargetMutation_actionExecutionId_tenantId_fkey"
  FOREIGN KEY ("actionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "guard_action_target_mutation_insert"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  expected_generation INTEGER;
BEGIN
  PERFORM "p5_require_governed_execution"(
    NEW."tenantId",
    NEW."actionExecutionId"
  );

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      NEW."tenantId"
        || ':p5:target:' || NEW."targetKind"
        || ':' || NEW."targetRef",
      0
    )
  );

  SELECT COALESCE(MAX("targetGeneration"), -1) + 1
  INTO expected_generation
  FROM "ActionTargetMutation"
  WHERE "tenantId" = NEW."tenantId"
    AND "targetKind" = NEW."targetKind"
    AND "targetRef" = NEW."targetRef";

  IF NEW."targetGeneration" <> expected_generation THEN
    RAISE EXCEPTION 'ActionTargetMutation generation must be the next contiguous target generation'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ActionTargetMutation_insert_guard"
BEFORE INSERT ON "ActionTargetMutation"
FOR EACH ROW EXECUTE FUNCTION "guard_action_target_mutation_insert"();

CREATE FUNCTION "guard_action_target_mutation_append_only"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'ActionTargetMutation is append-only'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "ActionTargetMutation_append_only_guard"
BEFORE UPDATE OR DELETE ON "ActionTargetMutation"
FOR EACH ROW EXECUTE FUNCTION "guard_action_target_mutation_append_only"();

-- ---------------------------------------------------------------------------
-- Client-owned profile and append-only consent facts
-- ---------------------------------------------------------------------------

ALTER TABLE "CustomerProfile"
  ADD COLUMN "clientId" TEXT,
  ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "CustomerProfile"
  DROP CONSTRAINT "CustomerProfile_userId_fkey",
  DROP CONSTRAINT "CustomerProfile_userId_tenantId_fkey";

ALTER TABLE "CustomerProfile"
  ADD CONSTRAINT "CustomerProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "CustomerProfile"
  ADD CONSTRAINT "CustomerProfile_userId_tenantId_fkey"
  FOREIGN KEY ("userId", "tenantId")
  REFERENCES "Membership"("userId", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "CustomerProfile"
  ADD CONSTRAINT "CustomerProfile_clientId_tenantId_fkey"
  FOREIGN KEY ("clientId", "tenantId")
  REFERENCES "Client"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE UNIQUE INDEX "CustomerProfile_tenantId_clientId_key"
  ON "CustomerProfile"("tenantId", "clientId");

ALTER TABLE "CustomerProfile"
  ADD CONSTRAINT "CustomerProfile_owner_present_check"
  CHECK ("clientId" IS NOT NULL OR "userId" IS NOT NULL);

CREATE FUNCTION "guard_customer_profile_client_owner"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR (
      OLD."clientId" IS NOT NULL
      AND NEW."clientId" IS DISTINCT FROM OLD."clientId"
    )
  THEN
    RAISE EXCEPTION 'Established CustomerProfile tenant and Client owner are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "CustomerProfile_client_owner_guard"
BEFORE UPDATE OF "tenantId", "clientId" ON "CustomerProfile"
FOR EACH ROW EXECUTE FUNCTION "guard_customer_profile_client_owner"();

CREATE TABLE "ClientConsentFact" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceIdentityHash" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actionExecutionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClientConsentFact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientConsentFact_kind_source_nonempty_check"
    CHECK (length(btrim("kind")) > 0 AND length(btrim("sourceType")) > 0),
  CONSTRAINT "ClientConsentFact_decision_check"
    CHECK ("decision" IN ('grant', 'revoke')),
  CONSTRAINT "ClientConsentFact_source_hash_check"
    CHECK ("sourceIdentityHash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "ClientConsentFact_id_tenantId_key"
  ON "ClientConsentFact"("id", "tenantId");
CREATE UNIQUE INDEX "ClientConsentFact_tenantId_sourceType_sourceIdentityHash_key"
  ON "ClientConsentFact"("tenantId", "sourceType", "sourceIdentityHash");
CREATE INDEX "ClientConsentFact_tenantId_clientId_kind_effectiveAt_idx"
  ON "ClientConsentFact"("tenantId", "clientId", "kind", "effectiveAt");
CREATE INDEX "ClientConsentFact_tenantId_actionExecutionId_idx"
  ON "ClientConsentFact"("tenantId", "actionExecutionId");

ALTER TABLE "ClientConsentFact"
  ADD CONSTRAINT "ClientConsentFact_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientConsentFact"
  ADD CONSTRAINT "ClientConsentFact_clientId_tenantId_fkey"
  FOREIGN KEY ("clientId", "tenantId")
  REFERENCES "Client"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ClientConsentFact"
  ADD CONSTRAINT "ClientConsentFact_actorUserId_tenantId_fkey"
  FOREIGN KEY ("actorUserId", "tenantId")
  REFERENCES "Membership"("userId", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ClientConsentFact"
  ADD CONSTRAINT "ClientConsentFact_actionExecutionId_tenantId_fkey"
  FOREIGN KEY ("actionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "guard_client_consent_fact_insert"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."actionExecutionId" IS NOT NULL THEN
    PERFORM "p5_require_governed_execution"(
      NEW."tenantId",
      NEW."actionExecutionId"
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ClientConsentFact_insert_guard"
BEFORE INSERT ON "ClientConsentFact"
FOR EACH ROW EXECUTE FUNCTION "guard_client_consent_fact_insert"();

CREATE FUNCTION "guard_client_consent_fact_append_only"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'ClientConsentFact is append-only'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "ClientConsentFact_append_only_guard"
BEFORE UPDATE OR DELETE ON "ClientConsentFact"
FOR EACH ROW EXECUTE FUNCTION "guard_client_consent_fact_append_only"();

-- ---------------------------------------------------------------------------
-- Operational task/support business aggregate
-- ---------------------------------------------------------------------------

CREATE TABLE "OperationalWorkItem" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "assigneeUserId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "title" TEXT NOT NULL,
  "bodyText" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createActionExecutionId" TEXT NOT NULL,
  "completeActionExecutionId" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OperationalWorkItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OperationalWorkItem_kind_check"
    CHECK ("kind" IN ('task', 'support_request')),
  CONSTRAINT "OperationalWorkItem_status_check"
    CHECK ("status" IN ('OPEN', 'COMPLETED')),
  CONSTRAINT "OperationalWorkItem_terminal_binding_check"
    CHECK (
      ("status" = 'OPEN' AND "completeActionExecutionId" IS NULL AND "completedAt" IS NULL)
      OR
      ("status" = 'COMPLETED' AND "completeActionExecutionId" IS NOT NULL AND "completedAt" IS NOT NULL)
    ),
  CONSTRAINT "OperationalWorkItem_content_nonempty_check"
    CHECK (length(btrim("title")) > 0 AND length(btrim("bodyText")) > 0)
);

CREATE UNIQUE INDEX "OperationalWorkItem_id_tenantId_key"
  ON "OperationalWorkItem"("id", "tenantId");
CREATE UNIQUE INDEX "OperationalWorkItem_tenantId_createActionExecutionId_key"
  ON "OperationalWorkItem"("tenantId", "createActionExecutionId");
CREATE UNIQUE INDEX "OperationalWorkItem_tenantId_completeActionExecutionId_key"
  ON "OperationalWorkItem"("tenantId", "completeActionExecutionId");
CREATE INDEX "OperationalWorkItem_tenantId_assigneeUserId_status_dueAt_idx"
  ON "OperationalWorkItem"("tenantId", "assigneeUserId", "status", "dueAt");
CREATE INDEX "OperationalWorkItem_tenantId_kind_status_createdAt_idx"
  ON "OperationalWorkItem"("tenantId", "kind", "status", "createdAt");

ALTER TABLE "OperationalWorkItem"
  ADD CONSTRAINT "OperationalWorkItem_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalWorkItem"
  ADD CONSTRAINT "OperationalWorkItem_assigneeUserId_tenantId_fkey"
  FOREIGN KEY ("assigneeUserId", "tenantId")
  REFERENCES "Membership"("userId", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "OperationalWorkItem"
  ADD CONSTRAINT "OperationalWorkItem_createdByUserId_tenantId_fkey"
  FOREIGN KEY ("createdByUserId", "tenantId")
  REFERENCES "Membership"("userId", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "OperationalWorkItem"
  ADD CONSTRAINT "OperationalWorkItem_createActionExecutionId_tenantId_fkey"
  FOREIGN KEY ("createActionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "OperationalWorkItem"
  ADD CONSTRAINT "OperationalWorkItem_completeActionExecutionId_tenantId_fkey"
  FOREIGN KEY ("completeActionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "guard_operational_work_item_insert"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM "p5_require_governed_execution"(
    NEW."tenantId",
    NEW."createActionExecutionId"
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER "OperationalWorkItem_insert_guard"
BEFORE INSERT ON "OperationalWorkItem"
FOR EACH ROW EXECUTE FUNCTION "guard_operational_work_item_insert"();

CREATE FUNCTION "guard_operational_work_item_transition"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."assigneeUserId" IS DISTINCT FROM OLD."assigneeUserId"
    OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
    OR NEW."title" IS DISTINCT FROM OLD."title"
    OR NEW."bodyText" IS DISTINCT FROM OLD."bodyText"
    OR NEW."dueAt" IS DISTINCT FROM OLD."dueAt"
    OR NEW."createActionExecutionId" IS DISTINCT FROM OLD."createActionExecutionId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'OperationalWorkItem creation identity and content are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."status" <> 'OPEN'
    OR NEW."status" <> 'COMPLETED'
    OR OLD."completeActionExecutionId" IS NOT NULL
    OR OLD."completedAt" IS NOT NULL
    OR NEW."completeActionExecutionId" IS NULL
    OR NEW."completedAt" IS NULL
  THEN
    RAISE EXCEPTION 'OperationalWorkItem allows one OPEN to COMPLETED transition'
      USING ERRCODE = '23514';
  END IF;

  PERFORM "p5_require_governed_execution"(
    NEW."tenantId",
    NEW."completeActionExecutionId"
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER "OperationalWorkItem_transition_guard"
BEFORE UPDATE ON "OperationalWorkItem"
FOR EACH ROW EXECUTE FUNCTION "guard_operational_work_item_transition"();

CREATE FUNCTION "guard_operational_work_item_delete"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'OperationalWorkItem is not physically deleted'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "OperationalWorkItem_delete_guard"
BEFORE DELETE ON "OperationalWorkItem"
FOR EACH ROW EXECUTE FUNCTION "guard_operational_work_item_delete"();

ALTER TABLE "InboxItem"
  ADD COLUMN "operationalWorkItemId" TEXT;
CREATE UNIQUE INDEX "InboxItem_id_tenantId_key"
  ON "InboxItem"("id", "tenantId");
CREATE INDEX "InboxItem_tenantId_operationalWorkItemId_idx"
  ON "InboxItem"("tenantId", "operationalWorkItemId");
ALTER TABLE "InboxItem"
  ADD CONSTRAINT "InboxItem_operationalWorkItemId_tenantId_fkey"
  FOREIGN KEY ("operationalWorkItemId", "tenantId")
  REFERENCES "OperationalWorkItem"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- Versioned, allowlisted, bounded maintenance runs and item claims
-- ---------------------------------------------------------------------------

CREATE TABLE "MaintenanceRun" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "tenantId" TEXT,
  "runIdentityVersion" INTEGER NOT NULL,
  "runIdentityFingerprint" TEXT NOT NULL,
  "maintenanceKind" TEXT NOT NULL,
  "subjectClass" TEXT NOT NULL,
  "policyKey" TEXT NOT NULL,
  "policyVersion" INTEGER NOT NULL,
  "cutoffAt" TIMESTAMP(3) NOT NULL,
  "maxItems" INTEGER NOT NULL,
  "batchSize" INTEGER NOT NULL,
  "cursorHash" TEXT,
  "state" TEXT NOT NULL DEFAULT 'PLANNED',
  "leaseOwner" TEXT,
  "leaseTokenHash" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "authorityType" TEXT NOT NULL,
  "requestedByUserId" TEXT,
  "approvedByUserId" TEXT,
  "approvalBindingHash" TEXT,
  "actionExecutionId" TEXT,
  "attemptedCount" INTEGER NOT NULL DEFAULT 0,
  "succeededCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MaintenanceRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceRun_scope_tenant_check"
    CHECK (
      ("scope" = 'tenant' AND "tenantId" IS NOT NULL)
      OR ("scope" = 'platform' AND "tenantId" IS NULL)
    ),
  CONSTRAINT "MaintenanceRun_version_limits_check"
    CHECK (
      "runIdentityVersion" > 0
      AND "policyVersion" > 0
      AND "maxItems" BETWEEN 1 AND 10000
      AND "batchSize" BETWEEN 1 AND "maxItems"
    ),
  CONSTRAINT "MaintenanceRun_identity_hash_check"
    CHECK (
      "runIdentityFingerprint" ~ '^[0-9a-f]{64}$'
      AND ("cursorHash" IS NULL OR "cursorHash" ~ '^[0-9a-f]{64}$')
      AND ("leaseTokenHash" IS NULL OR "leaseTokenHash" ~ '^[0-9a-f]{64}$')
      AND ("approvalBindingHash" IS NULL OR "approvalBindingHash" ~ '^[0-9a-f]{64}$')
    ),
  CONSTRAINT "MaintenanceRun_kind_policy_nonempty_check"
    CHECK (
      length(btrim("maintenanceKind")) > 0
      AND length(btrim("subjectClass")) > 0
      AND length(btrim("policyKey")) > 0
    ),
  CONSTRAINT "MaintenanceRun_state_check"
    CHECK ("state" IN ('PLANNED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED')),
  CONSTRAINT "MaintenanceRun_authority_check"
    CHECK (
      ("authorityType" = 'SYSTEM_POLICY' AND "approvedByUserId" IS NULL AND "approvalBindingHash" IS NULL)
      OR
      ("authorityType" = 'HUMAN_APPROVED' AND "approvedByUserId" IS NOT NULL AND "approvalBindingHash" IS NOT NULL)
    ),
  CONSTRAINT "MaintenanceRun_platform_execution_check"
    CHECK ("scope" = 'tenant' OR "actionExecutionId" IS NULL),
  CONSTRAINT "MaintenanceRun_counts_check"
    CHECK (
      "attemptedCount" >= 0
      AND "succeededCount" >= 0
      AND "failedCount" >= 0
      AND "succeededCount" + "failedCount" <= "attemptedCount"
      AND "attemptedCount" <= "maxItems"
    ),
  CONSTRAINT "MaintenanceRun_lifecycle_time_check"
    CHECK (
      ("state" = 'PLANNED' AND "startedAt" IS NULL AND "finishedAt" IS NULL)
      OR
      ("state" = 'RUNNING' AND "startedAt" IS NOT NULL AND "finishedAt" IS NULL)
      OR
      ("state" IN ('SUCCEEDED', 'PARTIAL', 'FAILED') AND "startedAt" IS NOT NULL AND "finishedAt" IS NOT NULL)
      OR
      ("state" = 'CANCELLED' AND "finishedAt" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "MaintenanceRun_runIdentityFingerprint_key"
  ON "MaintenanceRun"("runIdentityFingerprint");
CREATE UNIQUE INDEX "MaintenanceRun_id_scope_key"
  ON "MaintenanceRun"("id", "scope");
CREATE INDEX "MaintenanceRun_tenantId_maintenanceKind_state_createdAt_idx"
  ON "MaintenanceRun"("tenantId", "maintenanceKind", "state", "createdAt");
CREATE INDEX "MaintenanceRun_scope_state_leaseExpiresAt_idx"
  ON "MaintenanceRun"("scope", "state", "leaseExpiresAt");
CREATE INDEX "MaintenanceRun_tenantId_actionExecutionId_idx"
  ON "MaintenanceRun"("tenantId", "actionExecutionId");

ALTER TABLE "MaintenanceRun"
  ADD CONSTRAINT "MaintenanceRun_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "MaintenanceRun"
  ADD CONSTRAINT "MaintenanceRun_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "MaintenanceRun"
  ADD CONSTRAINT "MaintenanceRun_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "MaintenanceRun"
  ADD CONSTRAINT "MaintenanceRun_actionExecutionId_tenantId_fkey"
  FOREIGN KEY ("actionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "guard_maintenance_run_authority"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."scope" = 'tenant' THEN
    IF NEW."requestedByUserId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "Membership"
      WHERE "tenantId" = NEW."tenantId"
        AND "userId" = NEW."requestedByUserId"
    ) THEN
      RAISE EXCEPTION 'Tenant maintenance requester must be an exact tenant member'
        USING ERRCODE = '23514';
    END IF;

    IF NEW."approvedByUserId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "Membership"
      WHERE "tenantId" = NEW."tenantId"
        AND "userId" = NEW."approvedByUserId"
    ) THEN
      RAISE EXCEPTION 'Tenant maintenance approver must be an exact tenant member'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW."requestedByUserId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "User"
      WHERE "id" = NEW."requestedByUserId"
        AND "role"::TEXT IN ('platform_owner', 'platform_admin')
    ) THEN
      RAISE EXCEPTION 'Platform maintenance requester must have platform authority'
        USING ERRCODE = '23514';
    END IF;

    IF NEW."approvedByUserId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "User"
      WHERE "id" = NEW."approvedByUserId"
        AND "role"::TEXT IN ('platform_owner', 'platform_admin')
    ) THEN
      RAISE EXCEPTION 'Platform maintenance approver must have platform authority'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW."actionExecutionId" IS NOT NULL THEN
    PERFORM "p5_require_governed_execution"(
      NEW."tenantId",
      NEW."actionExecutionId"
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "MaintenanceRun_insert_authority_guard"
BEFORE INSERT ON "MaintenanceRun"
FOR EACH ROW EXECUTE FUNCTION "guard_maintenance_run_authority"();

CREATE FUNCTION "guard_maintenance_run_transition"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."scope" IS DISTINCT FROM OLD."scope"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."runIdentityVersion" IS DISTINCT FROM OLD."runIdentityVersion"
    OR NEW."runIdentityFingerprint" IS DISTINCT FROM OLD."runIdentityFingerprint"
    OR NEW."maintenanceKind" IS DISTINCT FROM OLD."maintenanceKind"
    OR NEW."subjectClass" IS DISTINCT FROM OLD."subjectClass"
    OR NEW."policyKey" IS DISTINCT FROM OLD."policyKey"
    OR NEW."policyVersion" IS DISTINCT FROM OLD."policyVersion"
    OR NEW."cutoffAt" IS DISTINCT FROM OLD."cutoffAt"
    OR NEW."maxItems" IS DISTINCT FROM OLD."maxItems"
    OR NEW."batchSize" IS DISTINCT FROM OLD."batchSize"
    OR NEW."authorityType" IS DISTINCT FROM OLD."authorityType"
    OR NEW."requestedByUserId" IS DISTINCT FROM OLD."requestedByUserId"
    OR NEW."approvedByUserId" IS DISTINCT FROM OLD."approvedByUserId"
    OR NEW."approvalBindingHash" IS DISTINCT FROM OLD."approvalBindingHash"
    OR NEW."actionExecutionId" IS DISTINCT FROM OLD."actionExecutionId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'MaintenanceRun identity, policy, limits and authority are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."attemptedCount" < OLD."attemptedCount"
    OR NEW."succeededCount" < OLD."succeededCount"
    OR NEW."failedCount" < OLD."failedCount"
  THEN
    RAISE EXCEPTION 'MaintenanceRun counters are monotonic'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."state" IN ('SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Terminal MaintenanceRun is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NOT (
    (OLD."state" = 'PLANNED' AND NEW."state" IN ('RUNNING', 'FAILED', 'CANCELLED'))
    OR
    (OLD."state" = 'RUNNING' AND NEW."state" IN ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'))
  ) THEN
    RAISE EXCEPTION 'Illegal MaintenanceRun state transition'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "MaintenanceRun_transition_guard"
BEFORE UPDATE ON "MaintenanceRun"
FOR EACH ROW EXECUTE FUNCTION "guard_maintenance_run_transition"();

CREATE FUNCTION "guard_maintenance_run_delete"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'MaintenanceRun is not physically deleted'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "MaintenanceRun_delete_guard"
BEFORE DELETE ON "MaintenanceRun"
FOR EACH ROW EXECUTE FUNCTION "guard_maintenance_run_delete"();

CREATE TABLE "MaintenanceItemClaim" (
  "id" TEXT NOT NULL,
  "maintenanceRunId" TEXT NOT NULL,
  "itemKind" TEXT NOT NULL,
  "itemRefHash" TEXT NOT NULL,
  "claimGeneration" INTEGER NOT NULL DEFAULT 0,
  "state" TEXT NOT NULL DEFAULT 'CLAIMED',
  "outcomeCode" TEXT,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MaintenanceItemClaim_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaintenanceItemClaim_identity_check"
    CHECK (
      length(btrim("itemKind")) > 0
      AND "itemRefHash" ~ '^[0-9a-f]{64}$'
      AND "claimGeneration" >= 0
    ),
  CONSTRAINT "MaintenanceItemClaim_state_check"
    CHECK ("state" IN ('CLAIMED', 'SUCCEEDED', 'FAILED', 'SKIPPED')),
  CONSTRAINT "MaintenanceItemClaim_terminal_check"
    CHECK (
      ("state" = 'CLAIMED' AND "outcomeCode" IS NULL AND "finishedAt" IS NULL)
      OR
      ("state" IN ('SUCCEEDED', 'FAILED', 'SKIPPED') AND "outcomeCode" IS NOT NULL AND "finishedAt" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "MaintenanceItemClaim_maintenanceRunId_itemKind_itemRefHash_key"
  ON "MaintenanceItemClaim"("maintenanceRunId", "itemKind", "itemRefHash");
CREATE INDEX "MaintenanceItemClaim_maintenanceRunId_state_claimedAt_idx"
  ON "MaintenanceItemClaim"("maintenanceRunId", "state", "claimedAt");

ALTER TABLE "MaintenanceItemClaim"
  ADD CONSTRAINT "MaintenanceItemClaim_maintenanceRunId_fkey"
  FOREIGN KEY ("maintenanceRunId") REFERENCES "MaintenanceRun"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "guard_maintenance_item_claim_transition"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."maintenanceRunId" IS DISTINCT FROM OLD."maintenanceRunId"
    OR NEW."itemKind" IS DISTINCT FROM OLD."itemKind"
    OR NEW."itemRefHash" IS DISTINCT FROM OLD."itemRefHash"
    OR NEW."claimedAt" IS DISTINCT FROM OLD."claimedAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'MaintenanceItemClaim identity is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."state" <> 'CLAIMED' THEN
    RAISE EXCEPTION 'Terminal MaintenanceItemClaim is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."state" = 'CLAIMED' THEN
    IF NEW."claimGeneration" <> OLD."claimGeneration" + 1
      OR NEW."outcomeCode" IS NOT NULL
      OR NEW."finishedAt" IS NOT NULL
    THEN
      RAISE EXCEPTION 'MaintenanceItemClaim restart must advance exactly one generation'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW."state" NOT IN ('SUCCEEDED', 'FAILED', 'SKIPPED')
      OR NEW."claimGeneration" <> OLD."claimGeneration"
      OR NEW."outcomeCode" IS NULL
      OR NEW."finishedAt" IS NULL
    THEN
      RAISE EXCEPTION 'MaintenanceItemClaim terminal transition is invalid'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "MaintenanceItemClaim_transition_guard"
BEFORE UPDATE ON "MaintenanceItemClaim"
FOR EACH ROW EXECUTE FUNCTION "guard_maintenance_item_claim_transition"();

CREATE FUNCTION "guard_maintenance_item_claim_delete"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'MaintenanceItemClaim is not physically deleted'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "MaintenanceItemClaim_delete_guard"
BEFORE DELETE ON "MaintenanceItemClaim"
FOR EACH ROW EXECUTE FUNCTION "guard_maintenance_item_claim_delete"();
