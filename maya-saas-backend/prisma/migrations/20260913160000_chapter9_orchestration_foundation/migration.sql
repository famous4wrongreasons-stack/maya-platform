-- Approved C9: five derived tables /123fields. No source writes or backfill.

BEGIN;
DO $c9_preflight$
DECLARE existing text;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('maya.c9.schema.v1',0)) THEN RAISE EXCEPTION 'c9_migration_lock_unavailable'; END IF;
 SELECT pg_get_constraintdef(oid) INTO existing FROM pg_constraint WHERE conrelid='"TenantBusinessConfigurationRevision"'::regclass AND conname='R11_config_contract_check';
 IF existing IS DISTINCT FROM $expected$CHECK (((namespace = ANY (ARRAY['business_rules'::text, 'client_capabilities'::text, 'staff_ai_provider'::text, 'c8_valuation'::text])) AND ("contractVersion" = 1) AND (revision > 0) AND ("contentHash" ~ '^[a-f0-9]{64}$'::text) AND (((revision = 1) AND ("previousRevisionId" IS NULL)) OR ((revision > 1) AND ("previousRevisionId" IS NOT NULL)))))$expected$ THEN RAISE EXCEPTION 'c9_unexpected_existing_a22_constraint'; END IF;
END $c9_preflight$;

ALTER TABLE "TenantBusinessConfigurationRevision" DROP CONSTRAINT "R11_config_contract_check";
ALTER TABLE "TenantBusinessConfigurationRevision" ADD CONSTRAINT "R11_config_contract_check" CHECK (
 "namespace" IN ('business_rules','client_capabilities','staff_ai_provider','c8_valuation','c9_orchestration') AND "contractVersion"=1 AND "revision">0
 AND "contentHash" ~ '^[a-f0-9]{64}$' AND (("revision"=1 AND "previousRevisionId" IS NULL) OR ("revision">1 AND "previousRevisionId" IS NOT NULL))
);

CREATE TABLE "C9Run" (
 "id" UUID DEFAULT gen_random_uuid() NOT NULL,
 "tenantId" TEXT NOT NULL,
 "contractVersion" INT NOT NULL,
 "principalJson" JSONB NOT NULL,
 "authorityHash" CHAR(64) NOT NULL,
 "requestKeyHash" CHAR(64) NOT NULL,
 "requestHash" CHAR(64) NOT NULL,
 "requestIntentJson" JSONB NOT NULL,
 "entryKind" TEXT NOT NULL,
 "entryRefJson" JSONB,
 "admittedAt" TIMESTAMPTZ(3) NOT NULL,
 "validUntil" TIMESTAMPTZ(3) NOT NULL,
 "retentionUntil" TIMESTAMPTZ(3) NOT NULL,
 "state" TEXT NOT NULL,
 "currentRevision" INT NOT NULL,
 "counterVersion" INT NOT NULL,
 "budgetManifestHash" CHAR(64) NOT NULL,
 "budgetManifestJson" JSONB NOT NULL,
 "budgetStateJson" JSONB NOT NULL,
 "reasoningUsedMs" INT NOT NULL,
 "reasoningWindowStartedAt" TIMESTAMPTZ(3),
 "reasoningWindowDeadlineAt" TIMESTAMPTZ(3),
 "leaseTokenHash" CHAR(64),
 "leaseUntil" TIMESTAMPTZ(3),
 "leaseGeneration" INT NOT NULL,
 "cancelKeyHash" CHAR(64),
 "cancelledAt" TIMESTAMPTZ(3),
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "C9Run_pkey" PRIMARY KEY(id),
 CONSTRAINT "C9Run_1_key" UNIQUE("id","tenantId"),
 CONSTRAINT "C9Run_2_key" UNIQUE("tenantId","requestKeyHash"),
 CONSTRAINT "C9Run_contract_ck" CHECK (("contractVersion"=1) IS TRUE),
 CONSTRAINT "C9Run_principal_ck" CHECK ((jsonb_typeof("principalJson")='object' AND "principalJson"->>'tenantId'="tenantId" AND "principalJson"->>'kind' IN ('USER','CLIENT_CHANNEL') AND octet_length("principalJson"::text)<=4096) IS TRUE),
 CONSTRAINT "C9Run_identity_ck" CHECK (("authorityHash" ~ '^[0-9a-f]{64}$' AND "requestKeyHash" ~ '^[0-9a-f]{64}$' AND "requestHash" ~ '^[0-9a-f]{64}$' AND jsonb_typeof("requestIntentJson")='object' AND octet_length("requestIntentJson"::text)<=16384) IS TRUE),
 CONSTRAINT "C9Run_entry_ck" CHECK ((("entryKind"='EXPLICIT_REQUEST' AND "entryRefJson" IS NULL) OR ("entryKind"='SELECTED_OPPORTUNITY' AND jsonb_typeof("entryRefJson")='object')) IS TRUE),
 CONSTRAINT "C9Run_time_ck" CHECK (("admittedAt"<"validUntil" AND "validUntil"<="admittedAt"+interval '24 hours' AND "retentionUntil"="admittedAt"+interval '365 days' ) IS TRUE),
 CONSTRAINT "C9Run_state_ck" CHECK ((state IN ('DRAFT','OPEN','WAITING','EXECUTING','PARTIAL','COMPLETED','STOPPED','CANCELLED','EXPIRED') AND "currentRevision" BETWEEN 0 AND 16 AND "counterVersion">=0) IS TRUE),
 CONSTRAINT "C9Run_budget_ck" CHECK (("budgetManifestHash" ~ '^[0-9a-f]{64}$' AND jsonb_typeof("budgetManifestJson")='object' AND jsonb_typeof("budgetStateJson")='object' AND octet_length("budgetManifestJson"::text)<=16384 AND octet_length("budgetStateJson"::text)<=16384 AND "budgetManifestJson"->>'contract'='maya.c9-budget/1' AND "budgetStateJson"->>'contract'='maya.c9-budget-state/1' ) IS TRUE),
 CONSTRAINT "C9Run_window_ck" CHECK (("reasoningUsedMs" BETWEEN 0 AND 120000 AND (("reasoningWindowStartedAt" IS NULL AND "reasoningWindowDeadlineAt" IS NULL) OR ("reasoningWindowStartedAt" IS NOT NULL AND "reasoningWindowDeadlineAt">"reasoningWindowStartedAt" AND extract(epoch FROM ("reasoningWindowDeadlineAt"-"reasoningWindowStartedAt"))*1000<=120000-"reasoningUsedMs"))) IS TRUE),
 CONSTRAINT "C9Run_lease_ck" CHECK (("leaseGeneration">=0 AND (("leaseTokenHash" IS NULL AND "leaseUntil" IS NULL) OR ("leaseTokenHash" ~ '^[0-9a-f]{64}$' AND "leaseUntil" IS NOT NULL))) IS TRUE),
 CONSTRAINT "C9Run_cancellation_ck" CHECK ((("cancelKeyHash" IS NULL AND "cancelledAt" IS NULL) OR ("cancelKeyHash" ~ '^[0-9a-f]{64}$' AND "cancelledAt" IS NOT NULL AND state='CANCELLED')) IS TRUE)
);

CREATE TABLE "C9StrategyRevision" (
 "id" UUID DEFAULT gen_random_uuid() NOT NULL,
 "tenantId" TEXT NOT NULL,
 "runId" UUID NOT NULL,
 "revision" INT NOT NULL,
 "parentRevisionId" UUID,
 "editKeyHash" CHAR(64) NOT NULL,
 "inputHash" CHAR(64) NOT NULL,
 "snapshotHash" CHAR(64) NOT NULL,
 "state" TEXT NOT NULL,
 "proposalContract" TEXT NOT NULL,
 "registryHash" CHAR(64) NOT NULL,
 "skillVersionsJson" JSONB NOT NULL,
 "objectiveJson" JSONB NOT NULL,
 "constraintsJson" JSONB NOT NULL,
 "alternativesJson" JSONB NOT NULL,
 "evidenceRefsJson" JSONB NOT NULL,
 "selectedOptionKey" TEXT,
 "reviewKeyHash" CHAR(64),
 "reviewHash" CHAR(64),
 "reviewActorJson" JSONB,
 "reviewedAt" TIMESTAMPTZ(3),
 "reviewDecision" TEXT,
 "admittedAt" TIMESTAMPTZ(3) NOT NULL,
 "validUntil" TIMESTAMPTZ(3) NOT NULL,
 "retentionUntil" TIMESTAMPTZ(3) NOT NULL,
 "terminalReason" TEXT,
 "terminalAt" TIMESTAMPTZ(3),
 CONSTRAINT "C9StrategyRevision_pkey" PRIMARY KEY(id),
 CONSTRAINT "C9StrategyRevision_1_key" UNIQUE("id","tenantId"),
 CONSTRAINT "C9StrategyRevision_2_key" UNIQUE("tenantId","runId","revision"),
 CONSTRAINT "C9StrategyRevision_3_key" UNIQUE("tenantId","runId","editKeyHash"),
 CONSTRAINT "C9StrategyRevision_contract_ck" CHECK (("proposalContract"='maya.c9-strategy/1' AND "registryHash" ~ '^[0-9a-f]{64}$' ) IS TRUE),
 CONSTRAINT "C9StrategyRevision_identity_ck" CHECK (("editKeyHash" ~ '^[0-9a-f]{64}$' AND "inputHash" ~ '^[0-9a-f]{64}$' AND "snapshotHash" ~ '^[0-9a-f]{64}$' ) IS TRUE),
 CONSTRAINT "C9StrategyRevision_revision_ck" CHECK ((revision BETWEEN 1 AND 16 AND ((revision=1 AND "parentRevisionId" IS NULL) OR (revision>1 AND "parentRevisionId" IS NOT NULL))) IS TRUE),
 CONSTRAINT "C9StrategyRevision_state_ck" CHECK ((state IN ('PROPOSED','VALIDATED','AWAITING_APPROVAL','ADMITTED','EXECUTING','PARTIAL','COMPLETED','STOPPED','CANCELLED','EXPIRED','SUPERSEDED')) IS TRUE),
 CONSTRAINT "C9StrategyRevision_strategy_ck" CHECK ((jsonb_typeof("objectiveJson")='object' AND jsonb_typeof("constraintsJson")='object' AND jsonb_typeof("alternativesJson")='array' AND jsonb_array_length("alternativesJson") BETWEEN 1 AND 3 AND jsonb_typeof("skillVersionsJson")='array' AND jsonb_array_length("skillVersionsJson")<=6) IS TRUE),
 CONSTRAINT "C9StrategyRevision_evidence_ck" CHECK ((jsonb_typeof("evidenceRefsJson")='array' AND jsonb_array_length("evidenceRefsJson")<=100) IS TRUE),
 CONSTRAINT "C9StrategyRevision_review_ck" CHECK ((("reviewedAt" IS NULL AND "selectedOptionKey" IS NULL AND "reviewKeyHash" IS NULL AND "reviewHash" IS NULL AND "reviewActorJson" IS NULL AND "reviewDecision" IS NULL) OR ("reviewedAt" IS NOT NULL AND "selectedOptionKey" IS NOT NULL AND "reviewKeyHash" ~ '^[0-9a-f]{64}$' AND "reviewHash" ~ '^[0-9a-f]{64}$' AND jsonb_typeof("reviewActorJson")='object' AND "reviewDecision" IN ('ACCEPTED','DECLINED') AND "reviewedAt"<="validUntil")) IS TRUE),
 CONSTRAINT "C9StrategyRevision_time_ck" CHECK (("admittedAt"<"validUntil" AND "validUntil"<="retentionUntil" ) IS TRUE),
 CONSTRAINT "C9StrategyRevision_terminal_ck" CHECK ((("terminalAt" IS NULL AND "terminalReason" IS NULL AND state NOT IN ('COMPLETED','STOPPED','CANCELLED','EXPIRED','SUPERSEDED')) OR ("terminalAt" IS NOT NULL AND length("terminalReason") BETWEEN 1 AND 128 AND state IN ('COMPLETED','STOPPED','CANCELLED','EXPIRED','SUPERSEDED'))) IS TRUE),
 CONSTRAINT "C9StrategyRevision_bounds_ck" CHECK ((octet_length(jsonb_build_array("objectiveJson","constraintsJson","alternativesJson","evidenceRefsJson","skillVersionsJson")::text)<=65536) IS TRUE)
);

CREATE TABLE "C9PlanStep" (
 "id" UUID DEFAULT gen_random_uuid() NOT NULL,
 "tenantId" TEXT NOT NULL,
 "revisionId" UUID NOT NULL,
 "optionKey" TEXT NOT NULL,
 "stepKey" TEXT NOT NULL,
 "ordinal" INT NOT NULL,
 "domain" TEXT NOT NULL,
 "kind" TEXT NOT NULL,
 "capability" TEXT NOT NULL,
 "registryHash" CHAR(64) NOT NULL,
 "intentContract" TEXT NOT NULL,
 "intentHash" CHAR(64) NOT NULL,
 "intentEncrypted" TEXT,
 "dependenciesJson" JSONB NOT NULL,
 "evidenceRefsJson" JSONB NOT NULL,
 "budgetSliceJson" JSONB NOT NULL,
 "state" TEXT NOT NULL,
 "leaseGeneration" INT NOT NULL,
 "leaseTokenHash" CHAR(64),
 "leaseUntil" TIMESTAMPTZ(3),
 "admittedAt" TIMESTAMPTZ(3) NOT NULL,
 "validUntil" TIMESTAMPTZ(3) NOT NULL,
 "retentionUntil" TIMESTAMPTZ(3) NOT NULL,
 "terminalAt" TIMESTAMPTZ(3),
 "stopReason" TEXT,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "C9PlanStep_pkey" PRIMARY KEY(id),
 CONSTRAINT "C9PlanStep_1_key" UNIQUE("id","tenantId"),
 CONSTRAINT "C9PlanStep_2_key" UNIQUE("tenantId","revisionId","optionKey","stepKey"),
 CONSTRAINT "C9PlanStep_3_key" UNIQUE("tenantId","revisionId","optionKey","ordinal"),
 CONSTRAINT "C9PlanStep_identity_ck" CHECK ((length("stepKey") BETWEEN 1 AND 128 AND length("optionKey") BETWEEN 1 AND 128 AND ordinal BETWEEN 1 AND 12 AND "intentHash" ~ '^[0-9a-f]{64}$' ) IS TRUE),
 CONSTRAINT "C9PlanStep_domain_ck" CHECK ((domain IN ('ADMIN','CLIENT_LIFECYCLE','OCCUPANCY','BUSINESS_INTELLIGENCE') AND NOT(domain='BUSINESS_INTELLIGENCE' AND kind='OWNER_HANDOFF')) IS TRUE),
 CONSTRAINT "C9PlanStep_kind_ck" CHECK ((kind IN ('READ','PROPOSE','OWNER_HANDOFF','NO_ACTION')) IS TRUE),
 CONSTRAINT "C9PlanStep_contract_ck" CHECK (("registryHash" ~ '^[0-9a-f]{64}$' AND length(capability) BETWEEN 1 AND 128 AND length("intentContract") BETWEEN 1 AND 128) IS TRUE),
 CONSTRAINT "C9PlanStep_graph_ck" CHECK ((jsonb_typeof("dependenciesJson")='array' AND jsonb_array_length("dependenciesJson")<=12) IS TRUE),
 CONSTRAINT "C9PlanStep_payload_ck" CHECK ((("intentEncrypted" IS NULL OR octet_length("intentEncrypted")<=32768) AND jsonb_typeof("evidenceRefsJson")='array' AND jsonb_array_length("evidenceRefsJson")<=100 AND octet_length("evidenceRefsJson"::text)<=16384) IS TRUE),
 CONSTRAINT "C9PlanStep_budget_ck" CHECK ((jsonb_typeof("budgetSliceJson")='object' AND octet_length("budgetSliceJson"::text)<=16384) IS TRUE),
 CONSTRAINT "C9PlanStep_state_ck" CHECK ((state IN ('WAITING','ELIGIBLE','CLAIMED','BOUND','RESOLVED','STOPPED') AND "leaseGeneration">=0 AND (("leaseTokenHash" IS NULL AND "leaseUntil" IS NULL) OR ("leaseTokenHash" ~ '^[0-9a-f]{64}$' AND "leaseUntil" IS NOT NULL)) AND (("terminalAt" IS NULL AND "stopReason" IS NULL AND state NOT IN ('RESOLVED','STOPPED')) OR ("terminalAt" IS NOT NULL AND length("stopReason") BETWEEN 1 AND 128 AND state IN ('RESOLVED','STOPPED')))) IS TRUE),
 CONSTRAINT "C9PlanStep_time_ck" CHECK (("admittedAt"<"validUntil" AND "validUntil"<="retentionUntil" ) IS TRUE)
);

CREATE TABLE "C9StepBinding" (
 "id" UUID DEFAULT gen_random_uuid() NOT NULL,
 "tenantId" TEXT NOT NULL,
 "stepId" UUID NOT NULL,
 "slotKey" TEXT NOT NULL,
 "ownerKey" TEXT NOT NULL,
 "bindingKind" TEXT NOT NULL,
 "sourceType" TEXT NOT NULL,
 "sourceId" TEXT NOT NULL,
 "sourceIdentityHash" CHAR(64) NOT NULL,
 "sourceIntentHash" CHAR(64) NOT NULL,
 "sourceApprovalHash" CHAR(64),
 "lineageJson" JSONB NOT NULL,
 "bindingHash" CHAR(64) NOT NULL,
 "boundAt" TIMESTAMPTZ(3) NOT NULL,
 "validUntil" TIMESTAMPTZ(3),
 "retentionUntil" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "C9StepBinding_pkey" PRIMARY KEY(id),
 CONSTRAINT "C9StepBinding_1_key" UNIQUE("id","tenantId"),
 CONSTRAINT "C9StepBinding_2_key" UNIQUE("tenantId","stepId","bindingKind","slotKey"),
 CONSTRAINT "C9StepBinding_identity_ck" CHECK ((length("slotKey") BETWEEN 1 AND 128 AND "bindingHash" ~ '^[0-9a-f]{64}$' ) IS TRUE),
 CONSTRAINT "C9StepBinding_contract_ck" CHECK ((length("ownerKey") BETWEEN 1 AND 128) IS TRUE),
 CONSTRAINT "C9StepBinding_kind_ck" CHECK (("bindingKind" IN ('APPROVAL','EXECUTION','OUTCOME','ASSIGNMENT')) IS TRUE),
 CONSTRAINT "C9StepBinding_source_ck" CHECK (("sourceType" IN ('ActionExecution','AiApprovalRequest','AiToolExecution','MarketingCampaign','OwnerReportRun','TenantBusinessConfigurationRevision','AgentTask','Opportunity','MeasurementRevision','C8ResultRevision','ClientBookingConfirmation') AND length("sourceId") BETWEEN 1 AND 128) IS TRUE),
 CONSTRAINT "C9StepBinding_hashes_ck" CHECK (("sourceIdentityHash" ~ '^[0-9a-f]{64}$' AND "sourceIntentHash" ~ '^[0-9a-f]{64}$' AND ("sourceApprovalHash" IS NULL OR "sourceApprovalHash" ~ '^[0-9a-f]{64}$')) IS TRUE),
 CONSTRAINT "C9StepBinding_lineage_ck" CHECK ((jsonb_typeof("lineageJson")='object' AND "lineageJson"->>'tenantId'="tenantId" AND octet_length("lineageJson"::text)<=8192) IS TRUE),
 CONSTRAINT "C9StepBinding_time_ck" CHECK (("boundAt"<"retentionUntil" AND ("validUntil" IS NULL OR "validUntil"<="retentionUntil")) IS TRUE)
);

CREATE TABLE "C9WorkReceipt" (
 "id" UUID DEFAULT gen_random_uuid() NOT NULL,
 "tenantId" TEXT NOT NULL,
 "runId" UUID NOT NULL,
 "revisionId" UUID,
 "callKeyHash" CHAR(64) NOT NULL,
 "domain" TEXT NOT NULL,
 "kind" TEXT NOT NULL,
 "taskKey" TEXT NOT NULL,
 "registryHash" CHAR(64) NOT NULL,
 "skillHash" CHAR(64),
 "inputHash" CHAR(64) NOT NULL,
 "inputEvidenceRefsJson" JSONB NOT NULL,
 "providerModelKey" TEXT,
 "priceBasisJson" JSONB,
 "reservationJson" JSONB NOT NULL,
 "usageJson" JSONB,
 "state" TEXT NOT NULL,
 "resultJson" JSONB,
 "resultHash" CHAR(64),
 "startedAt" TIMESTAMPTZ(3),
 "settledAt" TIMESTAMPTZ(3),
 "admittedAt" TIMESTAMPTZ(3) NOT NULL,
 "retentionUntil" TIMESTAMPTZ(3) NOT NULL,
 "leaseGeneration" INT NOT NULL,
 "leaseTokenHash" CHAR(64),
 "leaseUntil" TIMESTAMPTZ(3),
 CONSTRAINT "C9WorkReceipt_pkey" PRIMARY KEY(id),
 CONSTRAINT "C9WorkReceipt_1_key" UNIQUE("id","tenantId"),
 CONSTRAINT "C9WorkReceipt_2_key" UNIQUE("tenantId","runId","callKeyHash"),
 CONSTRAINT "C9WorkReceipt_identity_ck" CHECK (("callKeyHash" ~ '^[0-9a-f]{64}$' AND "inputHash" ~ '^[0-9a-f]{64}$' ) IS TRUE),
 CONSTRAINT "C9WorkReceipt_domain_ck" CHECK ((domain IN ('ORCHESTRATOR','ADMIN','CLIENT_LIFECYCLE','OCCUPANCY','BUSINESS_INTELLIGENCE') AND NOT(domain='BUSINESS_INTELLIGENCE' AND kind='OWNER_HANDOFF')) IS TRUE),
 CONSTRAINT "C9WorkReceipt_kind_ck" CHECK ((kind IN ('MODEL','TOOL_READ','OWNER_HANDOFF')) IS TRUE),
 CONSTRAINT "C9WorkReceipt_contract_ck" CHECK ((length("taskKey") BETWEEN 1 AND 128 AND "registryHash" ~ '^[0-9a-f]{64}$' AND ("skillHash" IS NULL OR "skillHash" ~ '^[0-9a-f]{64}$') AND (kind<>'MODEL' OR ("skillHash" IS NOT NULL AND "providerModelKey" IS NOT NULL))) IS TRUE),
 CONSTRAINT "C9WorkReceipt_evidence_ck" CHECK ((jsonb_typeof("inputEvidenceRefsJson")='array' AND jsonb_array_length("inputEvidenceRefsJson")<=100 AND octet_length("inputEvidenceRefsJson"::text)<=16384) IS TRUE),
 CONSTRAINT "C9WorkReceipt_price_ck" CHECK ((("priceBasisJson" IS NULL AND "reservationJson"->>'costMicros'='0' AND length("reservationJson"->>'zeroCostEvidenceRef') BETWEEN 1 AND 256) OR (jsonb_typeof("priceBasisJson")='object' AND "priceBasisJson"->>'hash' ~ '^[0-9a-f]{64}$' AND "priceBasisJson"->>'currency' ~ '^[A-Z]{3}$')) IS TRUE),
 CONSTRAINT "C9WorkReceipt_reservation_ck" CHECK ((jsonb_typeof("reservationJson")='object' AND "reservationJson"->>'contract'='maya.c9-reservation/1' AND octet_length("reservationJson"::text)<=8192) IS TRUE),
 CONSTRAINT "C9WorkReceipt_usage_ck" CHECK ((("usageJson" IS NULL AND "settledAt" IS NULL) OR (jsonb_typeof("usageJson")='object' AND "settledAt" IS NOT NULL AND "usageJson"->>'completionKind' IN ('CONFIRMED','ABORTED_BEFORE_DISPATCH'))) IS TRUE),
 CONSTRAINT "C9WorkReceipt_state_ck" CHECK ((state IN ('RESERVED','DISPATCHED','SETTLED','HELD_UNKNOWN','ABORTED_BEFORE_DISPATCH') AND "leaseGeneration">=0 AND (("leaseTokenHash" IS NULL AND "leaseUntil" IS NULL) OR ("leaseTokenHash" ~ '^[0-9a-f]{64}$' AND "leaseUntil" IS NOT NULL)) AND (("resultJson" IS NULL AND "resultHash" IS NULL) OR ("resultJson" IS NOT NULL AND "resultHash" ~ '^[0-9a-f]{64}$' AND octet_length("resultJson"::text)<=32768)) AND (state NOT IN ('DISPATCHED','HELD_UNKNOWN','SETTLED') OR "startedAt" IS NOT NULL) AND (state NOT IN ('SETTLED','ABORTED_BEFORE_DISPATCH') OR "settledAt" IS NOT NULL)) IS TRUE),
 CONSTRAINT "C9WorkReceipt_time_ck" CHECK (("admittedAt"<"retentionUntil" AND ("startedAt" IS NULL OR "startedAt">="admittedAt") AND ("settledAt" IS NULL OR "settledAt">="admittedAt")) IS TRUE)
);

ALTER TABLE "C9Run" ADD CONSTRAINT "C9Run_1_fkey" FOREIGN KEY("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "C9Run_1_idx" ON "C9Run"("tenantId","state","validUntil","id");

CREATE INDEX "C9Run_2_idx" ON "C9Run"("tenantId","retentionUntil","id");

ALTER TABLE "C9StrategyRevision" ADD CONSTRAINT "C9StrategyRevision_1_fkey" FOREIGN KEY("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "C9StrategyRevision" ADD CONSTRAINT "C9StrategyRevision_2_fkey" FOREIGN KEY("runId","tenantId") REFERENCES "C9Run"("id","tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "C9StrategyRevision" ADD CONSTRAINT "C9StrategyRevision_3_fkey" FOREIGN KEY("parentRevisionId","tenantId") REFERENCES "C9StrategyRevision"("id","tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "C9StrategyRevision_1_idx" ON "C9StrategyRevision"("tenantId","state","validUntil","id");

ALTER TABLE "C9PlanStep" ADD CONSTRAINT "C9PlanStep_1_fkey" FOREIGN KEY("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "C9PlanStep" ADD CONSTRAINT "C9PlanStep_2_fkey" FOREIGN KEY("revisionId","tenantId") REFERENCES "C9StrategyRevision"("id","tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "C9PlanStep_1_idx" ON "C9PlanStep"("tenantId","state","validUntil","id");

ALTER TABLE "C9StepBinding" ADD CONSTRAINT "C9StepBinding_1_fkey" FOREIGN KEY("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "C9StepBinding" ADD CONSTRAINT "C9StepBinding_2_fkey" FOREIGN KEY("stepId","tenantId") REFERENCES "C9PlanStep"("id","tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "C9StepBinding_1_idx" ON "C9StepBinding"("tenantId","sourceType","sourceId");

ALTER TABLE "C9WorkReceipt" ADD CONSTRAINT "C9WorkReceipt_1_fkey" FOREIGN KEY("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "C9WorkReceipt" ADD CONSTRAINT "C9WorkReceipt_2_fkey" FOREIGN KEY("runId","tenantId") REFERENCES "C9Run"("id","tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "C9WorkReceipt" ADD CONSTRAINT "C9WorkReceipt_3_fkey" FOREIGN KEY("revisionId","tenantId") REFERENCES "C9StrategyRevision"("id","tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "C9WorkReceipt_1_idx" ON "C9WorkReceipt"("tenantId","state","leaseUntil","id");

CREATE INDEX "C9WorkReceipt_2_idx" ON "C9WorkReceipt"("tenantId","runId","domain","kind");

CREATE UNIQUE INDEX "C9StepBinding_one_execution_idx" ON "C9StepBinding"("tenantId","sourceType","sourceId") WHERE "bindingKind"='EXECUTION';

-- Only the existing scoped AC6 claim permits deletion; no source rows are owned here.
CREATE FUNCTION "C9_retention_claim"(tenant text, tab text, item uuid, digest text, deadline timestamptz)
RETURNS boolean LANGUAGE sql SET timezone='UTC' AS $$
 SELECT tab IN ('C9Run','C9StrategyRevision','C9PlanStep','C9StepBinding','C9WorkReceipt')
 AND "RC_payload_claim"(tenant,tab,item::text,digest,deadline,'expire_c9_orchestration_runs','chapter9.orchestration-retention')
$$;

-- Source facts/permission remain source-owned. This validates the immutable *coordination* DAG.
CREATE FUNCTION "C9_validate_graph"(tenant text, revision_id uuid) RETURNS boolean
LANGUAGE plpgsql SET timezone='UTC' AS $$
DECLARE r "C9StrategyRevision"%ROWTYPE; root "C9Run"%ROWTYPE; opt jsonb; node "C9PlanStep"%ROWTYPE;
 dep jsonb; keys text[]:=ARRAY[]::text[]; graph jsonb; expected text;
BEGIN
 SELECT * INTO r FROM "C9StrategyRevision" WHERE id=revision_id AND "tenantId"=tenant;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO root FROM "C9Run" WHERE id=r."runId" AND "tenantId"=tenant FOR UPDATE;
 IF NOT FOUND OR r."validUntil">root."validUntil" OR r."retentionUntil">root."retentionUntil" THEN RETURN false; END IF;
 FOR opt IN SELECT value FROM jsonb_array_elements(r."alternativesJson") LOOP
  IF opt->>'key' IS NULL OR opt->>'key'=ANY(keys) THEN RETURN false; END IF;
  keys:=array_append(keys,opt->>'key');
  IF (SELECT count(*) FROM "C9PlanStep" WHERE "revisionId"=r.id AND "optionKey"=opt->>'key')>12 THEN RETURN false; END IF;
 END LOOP;
 IF r."selectedOptionKey" IS NOT NULL AND NOT r."selectedOptionKey"=ANY(keys) THEN RETURN false; END IF;
 FOR node IN SELECT * FROM "C9PlanStep" WHERE "revisionId"=r.id ORDER BY "optionKey",ordinal LOOP
  IF node."tenantId"<>tenant OR NOT node."optionKey"=ANY(keys) OR node."registryHash"<>r."registryHash"
     OR node."validUntil">r."validUntil" OR node."retentionUntil">r."retentionUntil" THEN RETURN false; END IF;
  IF (SELECT count(DISTINCT value->>'stepKey') FROM jsonb_array_elements(node."dependenciesJson"))<>jsonb_array_length(node."dependenciesJson") THEN RETURN false; END IF;
  FOR dep IN SELECT value FROM jsonb_array_elements(node."dependenciesJson") LOOP
   IF dep->>'requires' IS NULL OR dep->>'requires' NOT IN ('RESOLVED_SUCCESS','QUALIFIED_READ') OR NOT EXISTS (
    SELECT 1 FROM "C9PlanStep" p WHERE p."tenantId"=tenant AND p."revisionId"=r.id AND p."optionKey"=node."optionKey"
    AND p."stepKey"=dep->>'stepKey' AND p.ordinal<node.ordinal) THEN RETURN false; END IF;
  END LOOP;
 END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_array("optionKey","stepKey",ordinal,domain,kind,capability,"registryHash","intentContract","intentHash","dependenciesJson","evidenceRefsJson","budgetSliceJson",to_char("validUntil" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ORDER BY "optionKey",ordinal),'[]'::jsonb)
 INTO graph FROM "C9PlanStep" WHERE "tenantId"=tenant AND "revisionId"=r.id;
 expected:=encode(sha256(convert_to(jsonb_build_array('maya.c9-snapshot/1',r."proposalContract",r."registryHash",r."skillVersionsJson",r."objectiveJson",r."constraintsJson",r."alternativesJson",r."evidenceRefsJson",to_char(r."validUntil" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),graph)::text,'UTF8')),'hex');
 RETURN expected=r."snapshotHash";
END $$;

-- Work receipts are authoritative for resource use; root counters are an exact transactionally maintained projection.
-- The candidate is included for BEFORE INSERT/UPDATE, so stale root counters cannot allow over-reservation.
CREATE FUNCTION "C9_validate_budget"(tenant text, run_id uuid, candidate jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET timezone='UTC' AS $$
DECLARE r "C9Run"%ROWTYPE; w jsonb; v jsonb; usage jsonb; lim jsonb; statekey text; k text; dom text;
 result jsonb; domains text[]:=ARRAY[]::text[]; tool_total bigint:=0; model_total bigint:=0;
 itotal bigint:=0; ototal bigint:=0; ctotal numeric:=0; calls bigint; iv bigint; ov bigint; cv numeric; current_value numeric;
 domain_counts jsonb:='{}'; ai jsonb;
BEGIN
 SELECT * INTO r FROM "C9Run" WHERE id=run_id AND "tenantId"=tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'c9_run_missing' USING ERRCODE='23514'; END IF;
 lim:=r."budgetManifestJson"; ai:=lim->'aiCost';
 IF NOT (lim ?& ARRAY['domainsMax','toolCallsPerDomainMax','toolCallsMax','modelCallsMax','inputTokensMax','outputTokensMax','reasoningMsMax','parallelDomainsMax','inputTokensPerCallMax','outputTokensPerCallMax']) OR EXISTS(SELECT 1 FROM jsonb_each(lim) e WHERE e.key IN ('domainsMax','toolCallsPerDomainMax','toolCallsMax','modelCallsMax','inputTokensMax','outputTokensMax','reasoningMsMax','parallelDomainsMax','inputTokensPerCallMax','outputTokensPerCallMax') AND (jsonb_typeof(e.value)<>'number' OR e.value::text !~ '^[0-9]+$')) THEN RAISE EXCEPTION 'c9_budget_manifest_missing' USING ERRCODE='23514'; END IF;
 IF (lim->>'domainsMax')::int NOT BETWEEN 1 AND 2 OR (lim->>'toolCallsPerDomainMax')::int NOT BETWEEN 1 AND 6
 OR (lim->>'toolCallsMax')::int NOT BETWEEN 1 AND 12 OR (lim->>'modelCallsMax')::int NOT BETWEEN 1 AND 12
 OR (lim->>'inputTokensMax')::int NOT BETWEEN 1 AND 96000 OR (lim->>'outputTokensMax')::int NOT BETWEEN 1 AND 48000
 OR (lim->>'reasoningMsMax')::int NOT BETWEEN 1 AND 120000 OR (lim->>'parallelDomainsMax')::int NOT BETWEEN 1 AND 2 OR (lim->>'inputTokensPerCallMax')::int NOT BETWEEN 1 AND 8000 OR (lim->>'outputTokensPerCallMax')::int NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'c9_budget_manifest' USING ERRCODE='23514'; END IF;
 result:='{"contract":"maya.c9-budget-state/1","domains":[],"tool":{"reserved":0,"settled":0,"held":0,"byDomain":{}},"model":{"reserved":0,"settled":0,"held":0},"tokens":{"input":{"reserved":0,"settled":0,"held":0},"output":{"reserved":0,"settled":0,"held":0}},"aiCostMicros":{"reserved":"0","settled":"0","held":"0"},"dispatchExposureRefs":[]}'::jsonb;
 FOR w IN SELECT to_jsonb(x) FROM "C9WorkReceipt" x WHERE x."tenantId"=tenant AND x."runId"=run_id AND (candidate IS NULL OR x.id::text<>candidate->>'id')
 UNION ALL SELECT candidate WHERE candidate IS NOT NULL LOOP
  v:=w->'reservationJson'; usage:=w->'usageJson'; dom:=w->>'domain';
 IF NOT(v ?& ARRAY['domain','toolCalls','modelCalls','inputTokens','outputTokens','costMicros']) OR EXISTS(SELECT 1 FROM jsonb_each(v) e WHERE e.key IN ('toolCalls','modelCalls','inputTokens','outputTokens') AND (jsonb_typeof(e.value)<>'number' OR e.value::text !~ '^[0-9]+$')) OR jsonb_typeof(v->'domain') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'costMicros') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'c9_reservation_missing' USING ERRCODE='23514'; END IF;
  IF dom<>'ORCHESTRATOR' AND NOT dom=ANY(domains) THEN domains:=array_append(domains,dom); END IF;
  statekey:=CASE WHEN w->>'state'='HELD_UNKNOWN' THEN 'held' WHEN w->>'state' IN ('SETTLED','ABORTED_BEFORE_DISPATCH') THEN 'settled' ELSE 'reserved' END;
  k:=CASE WHEN w->>'kind'='MODEL' THEN 'model' ELSE 'tool' END;
  IF v->>'domain'<>dom OR (v->>'toolCalls')::int<>(CASE WHEN k='tool' THEN 1 ELSE 0 END) OR (v->>'modelCalls')::int<>(CASE WHEN k='model' THEN 1 ELSE 0 END)
   OR (v->>'inputTokens')::bigint NOT BETWEEN 0 AND 8000 OR (v->>'outputTokens')::bigint NOT BETWEEN 0 AND 4000
   OR v->>'costMicros' !~ '^(0|[1-9][0-9]{0,18})$' OR (v->>'costMicros')::numeric>9223372036854775807 THEN RAISE EXCEPTION 'c9_reservation_invalid' USING ERRCODE='23514'; END IF;
  iv:=(v->>'inputTokens')::bigint; ov:=(v->>'outputTokens')::bigint; cv:=(v->>'costMicros')::numeric;
  IF statekey='settled' THEN
   IF jsonb_typeof(usage) IS DISTINCT FROM 'object' OR NOT(usage ?& ARRAY['inputTokens','outputTokens','costMicros','completionKind']) OR EXISTS(SELECT 1 FROM jsonb_each(usage) e WHERE e.key IN ('inputTokens','outputTokens') AND (jsonb_typeof(e.value)<>'number' OR e.value::text !~ '^[0-9]+$')) OR jsonb_typeof(usage->'costMicros') IS DISTINCT FROM 'string' OR usage->>'costMicros' !~ '^(0|[1-9][0-9]{0,18})$' THEN RAISE EXCEPTION 'c9_usage_required' USING ERRCODE='23514'; END IF;
   iv:=(usage->>'inputTokens')::bigint; ov:=(usage->>'outputTokens')::bigint; cv:=(usage->>'costMicros')::numeric;
  END IF;
  IF iv IS NULL OR ov IS NULL OR cv IS NULL OR iv<0 OR ov<0 OR cv<0 OR cv>9223372036854775807 THEN RAISE EXCEPTION 'c9_negative_usage' USING ERRCODE='23514'; END IF;
  IF (v->>'costMicros')::numeric>0 AND (ai IS NULL OR ai='null'::jsonb OR jsonb_typeof(w->'priceBasisJson')<>'object'
     OR w->'priceBasisJson'->>'currency'<>ai->>'currency' OR w->'priceBasisJson'->>'hash'<>ai->>'priceManifestHash') THEN
    RAISE EXCEPTION 'c9_paid_cost_basis_required' USING ERRCODE='23514'; END IF;
  result:=jsonb_set(result,ARRAY[k,statekey],to_jsonb((result#>>ARRAY[k,statekey])::bigint+1));
  result:=jsonb_set(result,ARRAY['tokens','input',statekey],to_jsonb((result#>>ARRAY['tokens','input',statekey])::bigint+iv));
  result:=jsonb_set(result,ARRAY['tokens','output',statekey],to_jsonb((result#>>ARRAY['tokens','output',statekey])::bigint+ov));
  result:=jsonb_set(result,ARRAY['aiCostMicros',statekey],to_jsonb(((result#>>ARRAY['aiCostMicros',statekey])::numeric+cv)::text));
  IF k='tool' THEN
   tool_total:=tool_total+1; domain_counts:=jsonb_set(domain_counts,ARRAY[dom],to_jsonb(coalesce((domain_counts->>dom)::int,0)+1));
  ELSE model_total:=model_total+1; END IF;
  itotal:=itotal+iv; ototal:=ototal+ov; ctotal:=ctotal+cv;
 END LOOP;
 IF cardinality(domains)>(lim->>'domainsMax')::int OR tool_total>(lim->>'toolCallsMax')::int OR model_total>(lim->>'modelCallsMax')::int
 OR EXISTS(SELECT 1 FROM jsonb_each_text(domain_counts) d WHERE d.key<>'ORCHESTRATOR' AND d.value::int>(lim->>'toolCallsPerDomainMax')::int) THEN
  RAISE EXCEPTION 'c9_call_budget_exhausted' USING ERRCODE='23514'; END IF;
 IF (itotal>(lim->>'inputTokensMax')::bigint OR ototal>(lim->>'outputTokensMax')::bigint OR ctotal>coalesce((ai->>'capMicros')::numeric,0))
 AND r.state<>'STOPPED' AND coalesce(candidate->>'state','')<>'SETTLED' THEN RAISE EXCEPTION 'c9_token_cost_budget_exhausted' USING ERRCODE='23514'; END IF;
 result:=jsonb_set(result,'{domains}',coalesce((SELECT jsonb_agg(d ORDER BY d) FROM unnest(domains) d),'[]'));
 result:=jsonb_set(result,'{tool,byDomain}',domain_counts);
 RETURN result;
END $$;

CREATE FUNCTION "C9Run_guard"() RETURNS trigger LANGUAGE plpgsql SET timezone='UTC' AS $$
DECLARE root "C9Run"%ROWTYPE; rev "C9StrategyRevision"%ROWTYPE; node "C9PlanStep"%ROWTYPE; source jsonb; sequence int; field text;
BEGIN
 IF TG_OP='TRUNCATE' THEN RAISE EXCEPTION 'c9_truncate_forbidden' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN
  IF NOT "C9_retention_claim"(OLD."tenantId",TG_TABLE_NAME,OLD.id,OLD."requestHash",OLD."retentionUntil") THEN RAISE EXCEPTION 'c9_exact_ac6_claim_required' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(OLD)-ARRAY['state','currentRevision','counterVersion','budgetStateJson','reasoningUsedMs','reasoningWindowStartedAt','reasoningWindowDeadlineAt','leaseTokenHash','leaseUntil','leaseGeneration','cancelKeyHash','cancelledAt','updatedAt']::text[]) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['state','currentRevision','counterVersion','budgetStateJson','reasoningUsedMs','reasoningWindowStartedAt','reasoningWindowDeadlineAt','leaseTokenHash','leaseUntil','leaseGeneration','cancelKeyHash','cancelledAt','updatedAt']::text[]) THEN RAISE EXCEPTION 'c9_immutable_C9Run' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)->'cancelKeyHash')<>'null'::jsonb AND (to_jsonb(OLD)->'cancelKeyHash') IS DISTINCT FROM (to_jsonb(NEW)->'cancelKeyHash') THEN RAISE EXCEPTION 'c9_write_once_cancelKeyHash' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)->'cancelledAt')<>'null'::jsonb AND (to_jsonb(OLD)->'cancelledAt') IS DISTINCT FROM (to_jsonb(NEW)->'cancelledAt') THEN RAISE EXCEPTION 'c9_write_once_cancelledAt' USING ERRCODE='23514'; END IF;
 END IF;
IF TG_OP='INSERT' THEN
 IF NOT ((NEW."budgetManifestJson" ?& ARRAY['contract','registryHash','limitVersion','domainsMax','toolCallsMax','toolCallsPerDomainMax','modelCallsMax','inputTokensMax','outputTokensMax','inputTokensPerCallMax','outputTokensPerCallMax','reasoningMsMax','parallelDomainsMax','aiCost','tenantConfigRef']) AND (NEW."budgetManifestJson" - ARRAY['contract','registryHash','limitVersion','domainsMax','toolCallsMax','toolCallsPerDomainMax','modelCallsMax','inputTokensMax','outputTokensMax','inputTokensPerCallMax','outputTokensPerCallMax','reasoningMsMax','parallelDomainsMax','aiCost','tenantConfigRef'])='{}'::jsonb AND NEW."budgetManifestJson"->>'limitVersion'='1' AND NEW."budgetManifestJson"->>'registryHash' ~ '^[a-f0-9]{64}$' AND jsonb_typeof(NEW."budgetManifestJson"->'domainsMax')='number' AND (NEW."budgetManifestJson"->>'domainsMax') ~ '^[0-9]+$' AND (NEW."budgetManifestJson"->>'domainsMax')::numeric BETWEEN 1 AND 2 AND jsonb_typeof(NEW."budgetManifestJson"->'toolCallsMax')='number' AND (NEW."budgetManifestJson"->>'toolCallsMax') ~ '^[0-9]+$' AND (NEW."budgetManifestJson"->>'toolCallsMax')::numeric BETWEEN 1 AND 12 AND jsonb_typeof(NEW."budgetManifestJson"->'toolCallsPerDomainMax')='number' AND (NEW."budgetManifestJson"->>'toolCallsPerDomainMax') ~ '^[0-9]+$' AND (NEW."budgetManifestJson"->>'toolCallsPerDomainMax')::numeric BETWEEN 1 AND 6 AND jsonb_typeof(NEW."budgetManifestJson"->'modelCallsMax')='number' AND (NEW."budgetManifestJson"->>'modelCallsMax') ~ '^[0-9]+$' AND (NEW."budgetManifestJson"->>'modelCallsMax')::numeric BETWEEN 1 AND 12 AND jsonb_typeof(NEW."budgetManifestJson"->'inputTokensMax')='number' AND (NEW."budgetManifestJson"->>'inputTokensMax') ~ '^[0-9]+$' AND (NEW."budgetManifestJson"->>'inputTokensMax')::numeric BETWEEN 1 AND 96000 AND jsonb_typeof(NEW."budgetManifestJson"->'outputTokensMax')='number' AND (NEW."budgetManifestJson"->>'outputTokensMax') ~ '^[0-9]+$' AND (NEW."budgetManifestJson"->>'outputTokensMax')::numeric BETWEEN 1 AND 48000 AND jsonb_typeof(NEW."budgetManifestJson"->'inputTokensPerCallMax')='number' AND (NEW."budgetManifestJson"->>'inputTokensPerCallMax') ~ '^[0-9]+$' AND (NEW."budgetManifestJson"->>'inputTokensPerCallMax')::numeric BETWEEN 1 AND 8000 AND jsonb_typeof(NEW."budgetManifestJson"->'outputTokensPerCallMax')='number' AND (NEW."budgetManifestJson"->>'outputTokensPerCallMax') ~ '^[0-9]+$' AND (NEW."budgetManifestJson"->>'outputTokensPerCallMax')::numeric BETWEEN 1 AND 4000 AND jsonb_typeof(NEW."budgetManifestJson"->'reasoningMsMax')='number' AND (NEW."budgetManifestJson"->>'reasoningMsMax') ~ '^[0-9]+$' AND (NEW."budgetManifestJson"->>'reasoningMsMax')::numeric BETWEEN 1 AND 120000 AND jsonb_typeof(NEW."budgetManifestJson"->'parallelDomainsMax')='number' AND (NEW."budgetManifestJson"->>'parallelDomainsMax') ~ '^[0-9]+$' AND (NEW."budgetManifestJson"->>'parallelDomainsMax')::numeric BETWEEN 1 AND 2) IS TRUE THEN RAISE EXCEPTION 'c9_initial_budget_manifest' USING ERRCODE='23514'; END IF;
 IF NEW."budgetStateJson" IS DISTINCT FROM '{"contract":"maya.c9-budget-state/1","domains":[],"tool":{"reserved":0,"settled":0,"held":0,"byDomain":{}},"model":{"reserved":0,"settled":0,"held":0},"tokens":{"input":{"reserved":0,"settled":0,"held":0},"output":{"reserved":0,"settled":0,"held":0}},"aiCostMicros":{"reserved":"0","settled":"0","held":"0"},"dispatchExposureRefs":[]}'::jsonb THEN RAISE EXCEPTION 'c9_initial_budget_state' USING ERRCODE='23514'; END IF;
 IF NEW.state<>'DRAFT' OR NEW."currentRevision"<>0 OR NEW."counterVersion"<>0 OR NEW."reasoningUsedMs"<>0 OR NEW."leaseGeneration"<>0 OR NEW."leaseTokenHash" IS NOT NULL OR NEW."cancelledAt" IS NOT NULL THEN RAISE EXCEPTION 'c9_initial_run_state' USING ERRCODE='23514'; END IF;
 IF NEW."principalJson"->>'kind'='USER' THEN
  PERFORM m.id FROM "Membership" m JOIN "User" u ON u.id=m."userId" WHERE m.id=NEW."principalJson"->>'membershipId' AND m."tenantId"=NEW."tenantId" AND m."userId"=NEW."principalJson"->>'userId' AND m.status='active' AND u.status='active' FOR SHARE OF m,u;
 ELSE
  PERFORM l.id FROM "ClientChannelLink" l JOIN "Client" c ON c.id=l."clientId" AND c."tenantId"=l."tenantId" WHERE l.id=NEW."principalJson"->>'channelLinkId' AND l."tenantId"=NEW."tenantId" AND l."clientId"=NEW."principalJson"->>'clientId' AND l."revokedAt" IS NULL FOR SHARE OF l,c;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'c9_exact_principal_required' USING ERRCODE='23514'; END IF;
 IF NOT(NEW."requestIntentJson" ?& ARRAY['contract','eventEnvelopeHash','eventIssuedAt','eventExpiresAt','objectiveKey','safeQuestion','period','subjectRefs','oneOffConstraints','entryRef']) OR NEW."requestIntentJson"->>'contract' IS DISTINCT FROM 'maya.c9-request/1' OR NEW."requestIntentJson"->>'eventExpiresAt' IS NULL OR NEW."requestIntentJson"->>'eventIssuedAt' IS NULL OR (NEW."requestIntentJson"->>'eventIssuedAt')::timestamptz>clock_timestamp() OR (NEW."requestIntentJson"->>'eventExpiresAt')::timestamptz>(NEW."requestIntentJson"->>'eventIssuedAt')::timestamptz+interval '24 hours' OR (NEW."requestIntentJson"->>'eventExpiresAt')::timestamptz<=clock_timestamp() OR NEW."validUntil"> (NEW."requestIntentJson"->>'eventExpiresAt')::timestamptz THEN RAISE EXCEPTION 'c9_request_event_expired' USING ERRCODE='23514'; END IF;
ELSE
 IF NEW."counterVersion"<>OLD."counterVersion"+1 OR NEW."reasoningUsedMs"<OLD."reasoningUsedMs" OR NEW."leaseGeneration"<OLD."leaseGeneration" OR NEW."currentRevision"<OLD."currentRevision" OR NEW."currentRevision">OLD."currentRevision"+1 THEN RAISE EXCEPTION 'c9_run_fence' USING ERRCODE='23514'; END IF;
 IF OLD.state IN ('COMPLETED','STOPPED','CANCELLED','EXPIRED') AND NEW.state<>OLD.state THEN RAISE EXCEPTION 'c9_terminal_run' USING ERRCODE='23514'; END IF;
 IF NEW."currentRevision">0 AND NOT EXISTS(SELECT 1 FROM "C9StrategyRevision" v WHERE v."tenantId"=NEW."tenantId" AND v."runId"=NEW.id AND v.revision=NEW."currentRevision") THEN RAISE EXCEPTION 'c9_current_revision_missing' USING ERRCODE='23514'; END IF;
 IF NEW."budgetStateJson" IS DISTINCT FROM OLD."budgetStateJson" AND NEW."budgetStateJson" IS DISTINCT FROM "C9_validate_budget"(NEW."tenantId",NEW.id) THEN RAISE EXCEPTION 'c9_budget_projection_mismatch' USING ERRCODE='23514'; END IF;
END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION "C9StrategyRevision_guard"() RETURNS trigger LANGUAGE plpgsql SET timezone='UTC' AS $$
DECLARE root "C9Run"%ROWTYPE; rev "C9StrategyRevision"%ROWTYPE; node "C9PlanStep"%ROWTYPE; source jsonb; sequence int; field text;
BEGIN
 IF TG_OP='TRUNCATE' THEN RAISE EXCEPTION 'c9_truncate_forbidden' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN
  IF NOT "C9_retention_claim"(OLD."tenantId",TG_TABLE_NAME,OLD.id,OLD."snapshotHash",OLD."retentionUntil") THEN RAISE EXCEPTION 'c9_exact_ac6_claim_required' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(OLD)-ARRAY['state','selectedOptionKey','reviewKeyHash','reviewHash','reviewActorJson','reviewedAt','reviewDecision','terminalReason','terminalAt']::text[]) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['state','selectedOptionKey','reviewKeyHash','reviewHash','reviewActorJson','reviewedAt','reviewDecision','terminalReason','terminalAt']::text[]) THEN RAISE EXCEPTION 'c9_immutable_C9StrategyRevision' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)->'selectedOptionKey')<>'null'::jsonb AND (to_jsonb(OLD)->'selectedOptionKey') IS DISTINCT FROM (to_jsonb(NEW)->'selectedOptionKey') THEN RAISE EXCEPTION 'c9_write_once_selectedOptionKey' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)->'reviewKeyHash')<>'null'::jsonb AND (to_jsonb(OLD)->'reviewKeyHash') IS DISTINCT FROM (to_jsonb(NEW)->'reviewKeyHash') THEN RAISE EXCEPTION 'c9_write_once_reviewKeyHash' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)->'reviewHash')<>'null'::jsonb AND (to_jsonb(OLD)->'reviewHash') IS DISTINCT FROM (to_jsonb(NEW)->'reviewHash') THEN RAISE EXCEPTION 'c9_write_once_reviewHash' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)->'reviewActorJson')<>'null'::jsonb AND (to_jsonb(OLD)->'reviewActorJson') IS DISTINCT FROM (to_jsonb(NEW)->'reviewActorJson') THEN RAISE EXCEPTION 'c9_write_once_reviewActorJson' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)->'reviewedAt')<>'null'::jsonb AND (to_jsonb(OLD)->'reviewedAt') IS DISTINCT FROM (to_jsonb(NEW)->'reviewedAt') THEN RAISE EXCEPTION 'c9_write_once_reviewedAt' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)->'reviewDecision')<>'null'::jsonb AND (to_jsonb(OLD)->'reviewDecision') IS DISTINCT FROM (to_jsonb(NEW)->'reviewDecision') THEN RAISE EXCEPTION 'c9_write_once_reviewDecision' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)->'terminalReason')<>'null'::jsonb AND (to_jsonb(OLD)->'terminalReason') IS DISTINCT FROM (to_jsonb(NEW)->'terminalReason') THEN RAISE EXCEPTION 'c9_write_once_terminalReason' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)->'terminalAt')<>'null'::jsonb AND (to_jsonb(OLD)->'terminalAt') IS DISTINCT FROM (to_jsonb(NEW)->'terminalAt') THEN RAISE EXCEPTION 'c9_write_once_terminalAt' USING ERRCODE='23514'; END IF;
 END IF;
SELECT * INTO root FROM "C9Run" WHERE id=NEW."runId" AND "tenantId"=NEW."tenantId" FOR UPDATE;
IF NOT FOUND OR NEW."validUntil">root."validUntil" OR NEW."retentionUntil">root."retentionUntil" THEN RAISE EXCEPTION 'c9_revision_scope_time' USING ERRCODE='23514'; END IF;
IF TG_OP='INSERT' THEN
 IF root.state IN ('COMPLETED','STOPPED','CANCELLED','EXPIRED') OR root."validUntil"<=clock_timestamp() OR NEW.state<>'PROPOSED' OR NEW."reviewedAt" IS NOT NULL THEN RAISE EXCEPTION 'c9_revision_admission' USING ERRCODE='23514'; END IF;
 SELECT coalesce(max(revision),0) INTO sequence FROM "C9StrategyRevision" WHERE "runId"=NEW."runId" AND "tenantId"=NEW."tenantId";
 IF NEW.revision<>sequence+1 OR (sequence>0 AND NOT EXISTS(SELECT 1 FROM "C9StrategyRevision" v WHERE v.id=NEW."parentRevisionId" AND v."tenantId"=NEW."tenantId" AND v."runId"=NEW."runId" AND v.revision=sequence AND NEW."retentionUntil"<=v."retentionUntil")) THEN RAISE EXCEPTION 'c9_revision_sequence' USING ERRCODE='23514'; END IF;
ELSE
 IF OLD.state IN ('COMPLETED','STOPPED','CANCELLED','EXPIRED','SUPERSEDED') AND NEW.state<>OLD.state THEN RAISE EXCEPTION 'c9_terminal_revision' USING ERRCODE='23514'; END IF;
 IF NEW.state IN ('VALIDATED','AWAITING_APPROVAL','ADMITTED','EXECUTING','PARTIAL','COMPLETED') AND NOT "C9_validate_graph"(NEW."tenantId",NEW.id) THEN RAISE EXCEPTION 'c9_graph_invalid' USING ERRCODE='23514'; END IF;
 IF NEW."reviewedAt" IS NOT NULL AND OLD."reviewedAt" IS NULL AND (NEW."validUntil"<=clock_timestamp() OR NEW."reviewActorJson" IS DISTINCT FROM root."principalJson" OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW."alternativesJson") o WHERE o->>'key'=NEW."selectedOptionKey")) THEN RAISE EXCEPTION 'c9_exact_review' USING ERRCODE='23514'; END IF;
 IF NEW.state IN ('ADMITTED','EXECUTING','PARTIAL','COMPLETED') AND NEW."reviewDecision" IS DISTINCT FROM 'ACCEPTED' THEN RAISE EXCEPTION 'c9_review_required_not_effect_authority' USING ERRCODE='23514'; END IF;
END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION "C9PlanStep_guard"() RETURNS trigger LANGUAGE plpgsql SET timezone='UTC' AS $$
DECLARE root "C9Run"%ROWTYPE; rev "C9StrategyRevision"%ROWTYPE; node "C9PlanStep"%ROWTYPE; source jsonb; sequence int; field text;
BEGIN
 IF TG_OP='TRUNCATE' THEN RAISE EXCEPTION 'c9_truncate_forbidden' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN
  IF NOT "C9_retention_claim"(OLD."tenantId",TG_TABLE_NAME,OLD.id,OLD."intentHash",OLD."retentionUntil") THEN RAISE EXCEPTION 'c9_exact_ac6_claim_required' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(OLD)-ARRAY['intentEncrypted','state','leaseGeneration','leaseTokenHash','leaseUntil','terminalAt','stopReason','updatedAt']::text[]) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['intentEncrypted','state','leaseGeneration','leaseTokenHash','leaseUntil','terminalAt','stopReason','updatedAt']::text[]) THEN RAISE EXCEPTION 'c9_immutable_C9PlanStep' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)->'terminalAt')<>'null'::jsonb AND (to_jsonb(OLD)->'terminalAt') IS DISTINCT FROM (to_jsonb(NEW)->'terminalAt') THEN RAISE EXCEPTION 'c9_write_once_terminalAt' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)->'stopReason')<>'null'::jsonb AND (to_jsonb(OLD)->'stopReason') IS DISTINCT FROM (to_jsonb(NEW)->'stopReason') THEN RAISE EXCEPTION 'c9_write_once_stopReason' USING ERRCODE='23514'; END IF;
 END IF;
SELECT * INTO rev FROM "C9StrategyRevision" WHERE id=NEW."revisionId" AND "tenantId"=NEW."tenantId";
IF NOT FOUND THEN RAISE EXCEPTION 'c9_step_revision' USING ERRCODE='23514'; END IF;
SELECT * INTO root FROM "C9Run" WHERE id=rev."runId" AND "tenantId"=NEW."tenantId" FOR UPDATE;
IF NEW."registryHash"<>rev."registryHash" OR NEW."validUntil">rev."validUntil" OR NEW."retentionUntil">rev."retentionUntil" OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rev."alternativesJson") o WHERE o->>'key'=NEW."optionKey") THEN RAISE EXCEPTION 'c9_step_scope' USING ERRCODE='23514'; END IF;
IF TG_OP='INSERT' THEN
 IF rev.state<>'PROPOSED' OR NEW.state<>'WAITING' OR NEW."leaseGeneration"<>0 OR NEW."leaseTokenHash" IS NOT NULL THEN RAISE EXCEPTION 'c9_initial_step' USING ERRCODE='23514'; END IF;
ELSE
 IF NEW."intentEncrypted" IS NOT NULL AND NEW."intentEncrypted" IS DISTINCT FROM OLD."intentEncrypted" THEN RAISE EXCEPTION 'c9_intent_cipher_immutable' USING ERRCODE='23514'; END IF;
 IF NEW."leaseGeneration"<OLD."leaseGeneration" OR (OLD.state IN ('RESOLVED','STOPPED') AND NEW.state<>OLD.state) THEN RAISE EXCEPTION 'c9_step_fence' USING ERRCODE='23514'; END IF;
 IF NEW.state IN ('ELIGIBLE','CLAIMED') AND (root.state IN ('COMPLETED','STOPPED','CANCELLED','EXPIRED') OR rev.state NOT IN ('ADMITTED','EXECUTING','PARTIAL') OR rev."selectedOptionKey" IS DISTINCT FROM NEW."optionKey" OR root."currentRevision"<>rev.revision OR NEW."validUntil"<=clock_timestamp()) THEN RAISE EXCEPTION 'c9_step_not_eligible' USING ERRCODE='23514'; END IF;
 IF NEW.state='BOUND' AND NEW.kind='OWNER_HANDOFF' AND NOT EXISTS(SELECT 1 FROM "C9StepBinding" b WHERE b."stepId"=NEW.id AND b."tenantId"=NEW."tenantId" AND b."bindingKind"='EXECUTION') THEN RAISE EXCEPTION 'c9_source_admission_required' USING ERRCODE='23514'; END IF;
 IF NEW."intentEncrypted" IS NULL AND OLD."intentEncrypted" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "C9StepBinding" b WHERE b."stepId"=NEW.id AND b."tenantId"=NEW."tenantId") THEN RAISE EXCEPTION 'c9_minimization_requires_owner_receipt' USING ERRCODE='23514'; END IF;
END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION "C9StepBinding_guard"() RETURNS trigger LANGUAGE plpgsql SET timezone='UTC' AS $$
DECLARE root "C9Run"%ROWTYPE; rev "C9StrategyRevision"%ROWTYPE; node "C9PlanStep"%ROWTYPE; source jsonb; sequence int; field text;
BEGIN
 IF TG_OP='TRUNCATE' THEN RAISE EXCEPTION 'c9_truncate_forbidden' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN
  IF NOT "C9_retention_claim"(OLD."tenantId",TG_TABLE_NAME,OLD.id,OLD."bindingHash",OLD."retentionUntil") THEN RAISE EXCEPTION 'c9_exact_ac6_claim_required' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(OLD)-ARRAY[]::text[]) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY[]::text[]) THEN RAISE EXCEPTION 'c9_immutable_C9StepBinding' USING ERRCODE='23514'; END IF;
 END IF;
IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'c9_binding_immutable' USING ERRCODE='23514'; END IF;
SELECT * INTO node FROM "C9PlanStep" WHERE id=NEW."stepId" AND "tenantId"=NEW."tenantId";
IF NOT FOUND OR NEW."retentionUntil">node."retentionUntil" THEN RAISE EXCEPTION 'c9_binding_scope' USING ERRCODE='23514'; END IF;
SELECT * INTO rev FROM "C9StrategyRevision" WHERE id=node."revisionId" AND "tenantId"=NEW."tenantId";
PERFORM id FROM "C9Run" WHERE id=rev."runId" AND "tenantId"=NEW."tenantId" FOR UPDATE;
IF NEW."bindingKind"='EXECUTION' AND (NEW."sourceType"<>'ActionExecution' OR node.kind<>'OWNER_HANDOFF' OR rev."reviewDecision" IS DISTINCT FROM 'ACCEPTED' OR rev."selectedOptionKey"<>node."optionKey") THEN RAISE EXCEPTION 'c9_effect_binding_requires_reviewed_handoff' USING ERRCODE='23514'; END IF;
IF NEW."sourceType" NOT IN ('ActionExecution','AiApprovalRequest','AiToolExecution','MarketingCampaign','OwnerReportRun','TenantBusinessConfigurationRevision','AgentTask','Opportunity','MeasurementRevision','C8ResultRevision','ClientBookingConfirmation') THEN RAISE EXCEPTION 'c9_unregistered_source' USING ERRCODE='23514'; END IF;
EXECUTE format('SELECT to_jsonb(s) FROM %I s WHERE id::text=$1 AND "tenantId"=$2 FOR SHARE',NEW."sourceType") INTO source USING NEW."sourceId",NEW."tenantId";
IF source IS NULL THEN RAISE EXCEPTION 'c9_exact_source_required' USING ERRCODE='23514'; END IF;
IF NEW."sourceType"='ActionExecution' AND (source->>'identityFingerprint' IS DISTINCT FROM NEW."sourceIdentityHash" OR source->>'normalizedInputHash' IS DISTINCT FROM NEW."sourceIntentHash" OR source->>'dryRun' IS DISTINCT FROM 'false' OR source->>'capability' IS DISTINCT FROM NEW."ownerKey") THEN RAISE EXCEPTION 'c9_action_binding_mismatch' USING ERRCODE='23514'; END IF;
IF NEW."sourceType"='AiApprovalRequest' AND source->>'payloadHash' IS DISTINCT FROM NEW."sourceIntentHash" THEN RAISE EXCEPTION 'c9_tool_approval_mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION "C9WorkReceipt_guard"() RETURNS trigger LANGUAGE plpgsql SET timezone='UTC' AS $$
DECLARE root "C9Run"%ROWTYPE; rev "C9StrategyRevision"%ROWTYPE; node "C9PlanStep"%ROWTYPE; source jsonb; sequence int; field text;
BEGIN
 IF TG_OP='TRUNCATE' THEN RAISE EXCEPTION 'c9_truncate_forbidden' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN
  IF NOT "C9_retention_claim"(OLD."tenantId",TG_TABLE_NAME,OLD.id,OLD."inputHash",OLD."retentionUntil") THEN RAISE EXCEPTION 'c9_exact_ac6_claim_required' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(OLD)-ARRAY['usageJson','state','resultJson','resultHash','startedAt','settledAt','leaseGeneration','leaseTokenHash','leaseUntil']::text[]) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['usageJson','state','resultJson','resultHash','startedAt','settledAt','leaseGeneration','leaseTokenHash','leaseUntil']::text[]) THEN RAISE EXCEPTION 'c9_immutable_C9WorkReceipt' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)->'usageJson')<>'null'::jsonb AND (to_jsonb(OLD)->'usageJson') IS DISTINCT FROM (to_jsonb(NEW)->'usageJson') THEN RAISE EXCEPTION 'c9_write_once_usageJson' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)->'resultJson')<>'null'::jsonb AND (to_jsonb(OLD)->'resultJson') IS DISTINCT FROM (to_jsonb(NEW)->'resultJson') THEN RAISE EXCEPTION 'c9_write_once_resultJson' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)->'resultHash')<>'null'::jsonb AND (to_jsonb(OLD)->'resultHash') IS DISTINCT FROM (to_jsonb(NEW)->'resultHash') THEN RAISE EXCEPTION 'c9_write_once_resultHash' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)->'startedAt')<>'null'::jsonb AND (to_jsonb(OLD)->'startedAt') IS DISTINCT FROM (to_jsonb(NEW)->'startedAt') THEN RAISE EXCEPTION 'c9_write_once_startedAt' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)->'settledAt')<>'null'::jsonb AND (to_jsonb(OLD)->'settledAt') IS DISTINCT FROM (to_jsonb(NEW)->'settledAt') THEN RAISE EXCEPTION 'c9_write_once_settledAt' USING ERRCODE='23514'; END IF;
 END IF;
SELECT * INTO root FROM "C9Run" WHERE id=NEW."runId" AND "tenantId"=NEW."tenantId" FOR UPDATE;
IF NOT FOUND OR NEW."retentionUntil">root."retentionUntil" OR NEW."registryHash" IS DISTINCT FROM root."budgetManifestJson"->>'registryHash' THEN RAISE EXCEPTION 'c9_work_scope_registry' USING ERRCODE='23514'; END IF;
IF NEW."revisionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "C9StrategyRevision" v WHERE v.id=NEW."revisionId" AND v."tenantId"=NEW."tenantId" AND v."runId"=NEW."runId" AND NEW."retentionUntil"<=v."retentionUntil") THEN RAISE EXCEPTION 'c9_work_revision_scope' USING ERRCODE='23514'; END IF;
IF TG_OP='INSERT' THEN
 IF root.state IN ('COMPLETED','STOPPED','CANCELLED','EXPIRED') OR root."validUntil"<=clock_timestamp() OR NEW.state<>'RESERVED' OR NEW."startedAt" IS NOT NULL OR NEW."settledAt" IS NOT NULL OR NEW."resultJson" IS NOT NULL THEN RAISE EXCEPTION 'c9_work_admission' USING ERRCODE='23514'; END IF;
ELSE
 IF NEW."leaseGeneration"<OLD."leaseGeneration" OR OLD.state IN ('SETTLED','ABORTED_BEFORE_DISPATCH') OR (OLD.state='DISPATCHED' AND NEW.state NOT IN ('SETTLED','HELD_UNKNOWN')) OR (OLD.state='HELD_UNKNOWN' AND NEW.state NOT IN ('HELD_UNKNOWN','SETTLED')) OR (OLD.state='RESERVED' AND NEW.state NOT IN ('RESERVED','DISPATCHED','ABORTED_BEFORE_DISPATCH')) THEN RAISE EXCEPTION 'c9_work_no_blind_retry' USING ERRCODE='23514'; END IF;
 IF OLD.state='RESERVED' AND NEW.state='DISPATCHED' AND (NEW."leaseGeneration"<>OLD."leaseGeneration"+1 OR NEW."leaseTokenHash" IS NULL) THEN RAISE EXCEPTION 'c9_work_claim_fence' USING ERRCODE='23514'; END IF;
 IF OLD.state IN ('DISPATCHED','HELD_UNKNOWN') AND (NEW."leaseGeneration"<>OLD."leaseGeneration" OR NEW."leaseTokenHash" IS DISTINCT FROM OLD."leaseTokenHash" OR NEW."leaseUntil" IS DISTINCT FROM OLD."leaseUntil") THEN RAISE EXCEPTION 'c9_work_fence_immutable' USING ERRCODE='23514'; END IF;
 IF OLD.state IN ('DISPATCHED','HELD_UNKNOWN') AND NOT (
   current_setting('maya.c9_work_fence',true) IS NOT DISTINCT FROM OLD."leaseTokenHash"
   OR (NEW.state='HELD_UNKNOWN' AND OLD.state='DISPATCHED' AND OLD."leaseUntil"<=clock_timestamp() AND current_setting('maya.c9_work_recovery',true)=OLD.id::text)
 ) IS TRUE THEN RAISE EXCEPTION 'c9_work_exact_fence_required' USING ERRCODE='23514'; END IF;
 IF NEW.state='DISPATCHED' AND (root.state IN ('COMPLETED','STOPPED','CANCELLED','EXPIRED') OR root."validUntil"<=clock_timestamp() OR root."reasoningWindowDeadlineAt" IS NULL OR root."reasoningWindowDeadlineAt"<=clock_timestamp() OR NEW."leaseUntil" IS NULL OR NEW."leaseUntil"<=clock_timestamp()) THEN RAISE EXCEPTION 'c9_work_claim_invalid' USING ERRCODE='23514'; END IF;
END IF;
PERFORM "C9_validate_budget"(NEW."tenantId",NEW."runId",to_jsonb(NEW));
 RETURN NEW;
END $$;
CREATE TRIGGER "C9Run_write_trg" BEFORE INSERT OR UPDATE OR DELETE ON "C9Run" FOR EACH ROW EXECUTE FUNCTION "C9Run_guard"();
CREATE TRIGGER "C9Run_truncate_trg" BEFORE TRUNCATE ON "C9Run" FOR EACH STATEMENT EXECUTE FUNCTION "C9Run_guard"();
CREATE TRIGGER "C9StrategyRevision_write_trg" BEFORE INSERT OR UPDATE OR DELETE ON "C9StrategyRevision" FOR EACH ROW EXECUTE FUNCTION "C9StrategyRevision_guard"();
CREATE TRIGGER "C9StrategyRevision_truncate_trg" BEFORE TRUNCATE ON "C9StrategyRevision" FOR EACH STATEMENT EXECUTE FUNCTION "C9StrategyRevision_guard"();
CREATE TRIGGER "C9PlanStep_write_trg" BEFORE INSERT OR UPDATE OR DELETE ON "C9PlanStep" FOR EACH ROW EXECUTE FUNCTION "C9PlanStep_guard"();
CREATE TRIGGER "C9PlanStep_truncate_trg" BEFORE TRUNCATE ON "C9PlanStep" FOR EACH STATEMENT EXECUTE FUNCTION "C9PlanStep_guard"();
CREATE TRIGGER "C9StepBinding_write_trg" BEFORE INSERT OR UPDATE OR DELETE ON "C9StepBinding" FOR EACH ROW EXECUTE FUNCTION "C9StepBinding_guard"();
CREATE TRIGGER "C9StepBinding_truncate_trg" BEFORE TRUNCATE ON "C9StepBinding" FOR EACH STATEMENT EXECUTE FUNCTION "C9StepBinding_guard"();
CREATE TRIGGER "C9WorkReceipt_write_trg" BEFORE INSERT OR UPDATE OR DELETE ON "C9WorkReceipt" FOR EACH ROW EXECUTE FUNCTION "C9WorkReceipt_guard"();
CREATE TRIGGER "C9WorkReceipt_truncate_trg" BEFORE TRUNCATE ON "C9WorkReceipt" FOR EACH STATEMENT EXECUTE FUNCTION "C9WorkReceipt_guard"();

COMMIT;
