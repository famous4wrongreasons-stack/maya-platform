-- Chapter 5 durable Opportunity and AgentTask lifecycle.
-- Additive only: there is intentionally no historical backfill and no
-- ActionIntent persistence in this migration.

CREATE TYPE "OpportunityLifecycleStatus" AS ENUM (
  'active',
  'resolved',
  'expired',
  'superseded'
);

CREATE TYPE "OpportunityOutcome" AS ENUM (
  'inform_only',
  'investigation_required',
  'action_candidate'
);

CREATE TYPE "OpportunityAgentDomain" AS ENUM (
  'admin',
  'client_lifecycle',
  'occupancy',
  'business_intelligence'
);

CREATE TYPE "AgentTaskLifecycleStatus" AS ENUM ('current', 'invalidated');

CREATE TABLE "Opportunity" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "identityVersion" INTEGER NOT NULL DEFAULT 1,
  "semanticKey" TEXT NOT NULL,
  "identityFingerprint" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "affectedEntityKind" TEXT,
  "affectedEntityRef" TEXT,
  "evidenceFingerprint" TEXT NOT NULL,
  "evidenceRefsJson" JSONB NOT NULL,
  "evidenceObservedAt" TIMESTAMP(3) NOT NULL,
  "limitationsJson" JSONB NOT NULL,
  "policyKey" TEXT NOT NULL,
  "policyVersion" INTEGER NOT NULL,
  "recommendedAgentDomain" "OpportunityAgentDomain" NOT NULL,
  "outcome" "OpportunityOutcome" NOT NULL,
  "status" "OpportunityLifecycleStatus" NOT NULL DEFAULT 'active',
  "firstDetectedAt" TIMESTAMP(3) NOT NULL,
  "lastValidatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "terminalAt" TIMESTAMP(3),
  "terminalReasonCode" TEXT,
  "terminalEvidenceFingerprint" TEXT,
  "terminalEvidenceRefsJson" JSONB,
  "supersedesOpportunityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Opportunity_positive_versions_check" CHECK (
    "identityVersion" > 0 AND "revision" > 0 AND "policyVersion" > 0
  ),
  CONSTRAINT "Opportunity_entity_pair_check" CHECK (
    ("affectedEntityKind" IS NULL) = ("affectedEntityRef" IS NULL)
  ),
  CONSTRAINT "Opportunity_validation_clock_check" CHECK (
    "lastValidatedAt" >= "firstDetectedAt"
    AND "evidenceObservedAt" <= "lastValidatedAt"
    AND "expiresAt" > "firstDetectedAt"
    AND ("terminalAt" IS NULL OR "terminalAt" >= "firstDetectedAt")
  ),
  CONSTRAINT "Opportunity_terminal_shape_check" CHECK (
    (
      "status" = 'active'
      AND "terminalAt" IS NULL
      AND "terminalReasonCode" IS NULL
      AND "terminalEvidenceFingerprint" IS NULL
      AND "terminalEvidenceRefsJson" IS NULL
    )
    OR (
      "status" = 'resolved'
      AND "terminalAt" IS NOT NULL
      AND "terminalReasonCode" IS NOT NULL
      AND "terminalEvidenceFingerprint" IS NOT NULL
      AND "terminalEvidenceRefsJson" IS NOT NULL
    )
    OR (
      "status" IN ('expired', 'superseded')
      AND "terminalAt" IS NOT NULL
      AND "terminalReasonCode" IS NOT NULL
    )
  ),
  CONSTRAINT "Opportunity_no_self_supersession_check" CHECK (
    "supersedesOpportunityId" IS NULL OR "supersedesOpportunityId" <> "id"
  )
);

CREATE TABLE "AgentTask" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "semanticKey" TEXT NOT NULL,
  "taskFingerprint" TEXT NOT NULL,
  "agentDomain" "OpportunityAgentDomain" NOT NULL,
  "objectiveKey" TEXT NOT NULL,
  "allowedReadCapabilities" JSONB NOT NULL,
  "allowedActionClasses" JSONB NOT NULL,
  "autonomyLevel" TEXT NOT NULL DEFAULT 'L2_5_SHADOW',
  "status" "AgentTaskLifecycleStatus" NOT NULL DEFAULT 'current',
  "requestedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "invalidatedAt" TIMESTAMP(3),
  "invalidationReasonCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentTask_expiry_check" CHECK ("expiresAt" > "requestedAt"),
  CONSTRAINT "AgentTask_shadow_only_check" CHECK (
    "autonomyLevel" = 'L2_5_SHADOW'
  ),
  CONSTRAINT "AgentTask_invalidation_shape_check" CHECK (
    (
      "status" = 'current'
      AND "invalidatedAt" IS NULL
      AND "invalidationReasonCode" IS NULL
    )
    OR (
      "status" = 'invalidated'
      AND "invalidatedAt" IS NOT NULL
      AND "invalidationReasonCode" IS NOT NULL
      AND "invalidatedAt" >= "requestedAt"
    )
  )
);

CREATE INDEX "Opportunity_tenantId_status_expiresAt_idx"
  ON "Opportunity" ("tenantId", "status", "expiresAt");
CREATE INDEX "Opportunity_tenantId_type_status_idx"
  ON "Opportunity" ("tenantId", "type", "status");
CREATE INDEX "Opportunity_tenantId_semanticKey_revision_idx"
  ON "Opportunity" ("tenantId", "semanticKey", "revision");
CREATE UNIQUE INDEX "Opportunity_id_tenantId_key"
  ON "Opportunity" ("id", "tenantId");
CREATE UNIQUE INDEX "Opportunity_id_tenantId_semanticKey_key"
  ON "Opportunity" ("id", "tenantId", "semanticKey");
CREATE UNIQUE INDEX "Opportunity_tenantId_identityFingerprint_key"
  ON "Opportunity" ("tenantId", "identityFingerprint");
CREATE UNIQUE INDEX "Opportunity_tenantId_semanticKey_revision_key"
  ON "Opportunity" ("tenantId", "semanticKey", "revision");
CREATE UNIQUE INDEX "Opportunity_tenantId_supersedesOpportunityId_key"
  ON "Opportunity" ("tenantId", "supersedesOpportunityId");
CREATE UNIQUE INDEX "Opportunity_one_active_semantic_key"
  ON "Opportunity" ("tenantId", "semanticKey")
  WHERE "status" = 'active';

CREATE INDEX "AgentTask_tenantId_status_expiresAt_idx"
  ON "AgentTask" ("tenantId", "status", "expiresAt");
CREATE INDEX "AgentTask_tenantId_semanticKey_agentDomain_status_idx"
  ON "AgentTask" ("tenantId", "semanticKey", "agentDomain", "status");
CREATE UNIQUE INDEX "AgentTask_id_tenantId_key"
  ON "AgentTask" ("id", "tenantId");
CREATE UNIQUE INDEX "AgentTask_tenantId_taskFingerprint_key"
  ON "AgentTask" ("tenantId", "taskFingerprint");
CREATE UNIQUE INDEX "AgentTask_tenantId_opportunityId_agentDomain_key"
  ON "AgentTask" ("tenantId", "opportunityId", "agentDomain");
CREATE UNIQUE INDEX "AgentTask_one_current_semantic_domain"
  ON "AgentTask" ("tenantId", "semanticKey", "agentDomain")
  WHERE "status" = 'current';

ALTER TABLE "Opportunity"
  ADD CONSTRAINT "Opportunity_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Opportunity"
  ADD CONSTRAINT "Opportunity_supersedesOpportunityId_tenantId_semanticKey_fkey"
  FOREIGN KEY ("supersedesOpportunityId", "tenantId", "semanticKey")
  REFERENCES "Opportunity" ("id", "tenantId", "semanticKey")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AgentTask"
  ADD CONSTRAINT "AgentTask_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentTask"
  ADD CONSTRAINT "AgentTask_opportunityId_tenantId_semanticKey_fkey"
  FOREIGN KEY ("opportunityId", "tenantId", "semanticKey")
  REFERENCES "Opportunity" ("id", "tenantId", "semanticKey")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "guard_opportunity_transition"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."type" IS DISTINCT FROM OLD."type"
    OR NEW."identityVersion" IS DISTINCT FROM OLD."identityVersion"
    OR NEW."semanticKey" IS DISTINCT FROM OLD."semanticKey"
    OR NEW."identityFingerprint" IS DISTINCT FROM OLD."identityFingerprint"
    OR NEW."revision" IS DISTINCT FROM OLD."revision"
    OR NEW."affectedEntityKind" IS DISTINCT FROM OLD."affectedEntityKind"
    OR NEW."affectedEntityRef" IS DISTINCT FROM OLD."affectedEntityRef"
    OR NEW."evidenceFingerprint" IS DISTINCT FROM OLD."evidenceFingerprint"
    OR NEW."evidenceRefsJson" IS DISTINCT FROM OLD."evidenceRefsJson"
    OR NEW."evidenceObservedAt" IS DISTINCT FROM OLD."evidenceObservedAt"
    OR NEW."limitationsJson" IS DISTINCT FROM OLD."limitationsJson"
    OR NEW."policyKey" IS DISTINCT FROM OLD."policyKey"
    OR NEW."policyVersion" IS DISTINCT FROM OLD."policyVersion"
    OR NEW."recommendedAgentDomain" IS DISTINCT FROM OLD."recommendedAgentDomain"
    OR NEW."outcome" IS DISTINCT FROM OLD."outcome"
    OR NEW."firstDetectedAt" IS DISTINCT FROM OLD."firstDetectedAt"
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR NEW."supersedesOpportunityId" IS DISTINCT FROM OLD."supersedesOpportunityId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Opportunity identity, evidence, policy and expiry are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."status" <> 'active' THEN
    IF NEW."status" IS DISTINCT FROM OLD."status"
      OR NEW."lastValidatedAt" IS DISTINCT FROM OLD."lastValidatedAt"
      OR NEW."terminalAt" IS DISTINCT FROM OLD."terminalAt"
      OR NEW."terminalReasonCode" IS DISTINCT FROM OLD."terminalReasonCode"
      OR NEW."terminalEvidenceFingerprint" IS DISTINCT FROM OLD."terminalEvidenceFingerprint"
      OR NEW."terminalEvidenceRefsJson" IS DISTINCT FROM OLD."terminalEvidenceRefsJson"
    THEN
      RAISE EXCEPTION 'Terminal Opportunity is immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."status" NOT IN ('active', 'resolved', 'expired', 'superseded') THEN
    RAISE EXCEPTION 'Unsupported Opportunity transition'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."lastValidatedAt" < OLD."lastValidatedAt" THEN
    RAISE EXCEPTION 'Opportunity validation clock cannot move backwards'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."status" = 'active' AND (
    NEW."terminalAt" IS DISTINCT FROM OLD."terminalAt"
    OR NEW."terminalReasonCode" IS DISTINCT FROM OLD."terminalReasonCode"
    OR NEW."terminalEvidenceFingerprint" IS DISTINCT FROM OLD."terminalEvidenceFingerprint"
    OR NEW."terminalEvidenceRefsJson" IS DISTINCT FROM OLD."terminalEvidenceRefsJson"
  ) THEN
    RAISE EXCEPTION 'Active revalidation cannot mutate terminal proof'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Opportunity_transition_guard"
BEFORE UPDATE ON "Opportunity"
FOR EACH ROW EXECUTE FUNCTION "guard_opportunity_transition"();

CREATE FUNCTION "guard_opportunity_successor_insert"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."supersedesOpportunityId" IS NOT NULL AND NEW."status" <> 'active' THEN
    RAISE EXCEPTION 'Opportunity successor must be inserted active'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Opportunity_successor_insert_guard"
BEFORE INSERT ON "Opportunity"
FOR EACH ROW EXECUTE FUNCTION "guard_opportunity_successor_insert"();

CREATE FUNCTION "guard_agent_task_transition"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."opportunityId" IS DISTINCT FROM OLD."opportunityId"
    OR NEW."semanticKey" IS DISTINCT FROM OLD."semanticKey"
    OR NEW."taskFingerprint" IS DISTINCT FROM OLD."taskFingerprint"
    OR NEW."agentDomain" IS DISTINCT FROM OLD."agentDomain"
    OR NEW."objectiveKey" IS DISTINCT FROM OLD."objectiveKey"
    OR NEW."allowedReadCapabilities" IS DISTINCT FROM OLD."allowedReadCapabilities"
    OR NEW."allowedActionClasses" IS DISTINCT FROM OLD."allowedActionClasses"
    OR NEW."autonomyLevel" IS DISTINCT FROM OLD."autonomyLevel"
    OR NEW."requestedAt" IS DISTINCT FROM OLD."requestedAt"
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'AgentTask assignment fields are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."status" = 'invalidated' THEN
    IF NEW."status" IS DISTINCT FROM OLD."status"
      OR NEW."invalidatedAt" IS DISTINCT FROM OLD."invalidatedAt"
      OR NEW."invalidationReasonCode" IS DISTINCT FROM OLD."invalidationReasonCode"
    THEN
      RAISE EXCEPTION 'Invalidated AgentTask is immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."status" NOT IN ('current', 'invalidated') THEN
    RAISE EXCEPTION 'Unsupported AgentTask transition'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."status" = 'current' AND (
    NEW."invalidatedAt" IS DISTINCT FROM OLD."invalidatedAt"
    OR NEW."invalidationReasonCode" IS DISTINCT FROM OLD."invalidationReasonCode"
  ) THEN
    RAISE EXCEPTION 'Current AgentTask cannot mutate invalidation proof'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AgentTask_transition_guard"
BEFORE UPDATE ON "AgentTask"
FOR EACH ROW EXECUTE FUNCTION "guard_agent_task_transition"();

CREATE FUNCTION "check_opportunity_cross_row_invariants"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  successor_count INTEGER;
  predecessor_record RECORD;
  current_task_count INTEGER;
BEGIN
  IF NEW."status" = 'superseded' THEN
    SELECT COUNT(*) INTO successor_count
    FROM "Opportunity" successor
    WHERE successor."tenantId" = NEW."tenantId"
      AND successor."semanticKey" = NEW."semanticKey"
      AND successor."supersedesOpportunityId" = NEW."id"
      AND successor."revision" = NEW."revision" + 1;

    IF successor_count <> 1 THEN
      RAISE EXCEPTION 'Superseded Opportunity requires exactly one next revision'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW."status" <> 'active' THEN
    SELECT COUNT(*) INTO current_task_count
    FROM "AgentTask" task
    WHERE task."tenantId" = NEW."tenantId"
      AND task."opportunityId" = NEW."id"
      AND task."status" = 'current';

    IF current_task_count <> 0 THEN
      RAISE EXCEPTION 'Terminal Opportunity cannot retain a current AgentTask'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW."supersedesOpportunityId" IS NOT NULL THEN
    SELECT predecessor."tenantId", predecessor."semanticKey",
           predecessor."revision", predecessor."status"
      INTO predecessor_record
    FROM "Opportunity" predecessor
    WHERE predecessor."id" = NEW."supersedesOpportunityId";

    IF predecessor_record."tenantId" IS DISTINCT FROM NEW."tenantId"
      OR predecessor_record."semanticKey" IS DISTINCT FROM NEW."semanticKey"
      OR predecessor_record."revision" + 1 <> NEW."revision"
      OR predecessor_record."status" <> 'superseded'
    THEN
      RAISE EXCEPTION 'Invalid Opportunity supersession chain'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "Opportunity_cross_row_invariants"
AFTER INSERT OR UPDATE ON "Opportunity"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "check_opportunity_cross_row_invariants"();

CREATE FUNCTION "check_agent_task_cross_row_invariants"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  opportunity_record RECORD;
BEGIN
  SELECT opportunity."status", opportunity."expiresAt",
         opportunity."outcome", opportunity."recommendedAgentDomain"
    INTO opportunity_record
  FROM "Opportunity" opportunity
  WHERE opportunity."id" = NEW."opportunityId"
    AND opportunity."tenantId" = NEW."tenantId"
    AND opportunity."semanticKey" = NEW."semanticKey";

  IF NEW."expiresAt" > opportunity_record."expiresAt" THEN
    RAISE EXCEPTION 'AgentTask cannot outlive its Opportunity'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."status" = 'current' AND opportunity_record."status" <> 'active' THEN
    RAISE EXCEPTION 'Current AgentTask requires active Opportunity'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."status" = 'current' AND opportunity_record."outcome" = 'inform_only' THEN
    RAISE EXCEPTION 'Inform-only Opportunity cannot create AgentTask'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."agentDomain" <> opportunity_record."recommendedAgentDomain" THEN
    RAISE EXCEPTION 'AgentTask domain must match Opportunity route'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "AgentTask_cross_row_invariants"
AFTER INSERT OR UPDATE ON "AgentTask"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "check_agent_task_cross_row_invariants"();
