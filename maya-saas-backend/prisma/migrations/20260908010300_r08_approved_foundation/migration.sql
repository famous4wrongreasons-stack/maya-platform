BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Approved Wave R-C Option A. Prospective only; no historical backfill.
ALTER TABLE "ActionExecution" ADD COLUMN "nativeFeedbackRequestId" TEXT;

ALTER TABLE "ActionExecution" ADD COLUMN "nativeFeedbackRevisionId" TEXT;

ALTER TABLE "ActionExecution" ADD COLUMN "nativeFeedbackSlotKey" TEXT;

CREATE TABLE "NativeFeedbackRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "requestExecutionId" TEXT NOT NULL,
    "requestIdentityHash" CHAR(64) NOT NULL,
    "intentHash" CHAR(64) NOT NULL,
    "contractVersion" INTEGER NOT NULL,
    "eligibleAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "contentEncrypted" TEXT,
    "planHash" CHAR(64) NOT NULL,
    "planEncrypted" TEXT,
    "state" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "latestResponseVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "closedAt" TIMESTAMPTZ(3),
    "payloadErasedAt" TIMESTAMPTZ(3),
    "retentionUntil" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NativeFeedbackRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NativeFeedbackRevision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "identityHash" CHAR(64) NOT NULL,
    "intentHash" CHAR(64) NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "rating" INTEGER,
    "commentEncrypted" TEXT,
    "contentHash" CHAR(64) NOT NULL,
    "planHash" CHAR(64) NOT NULL,
    "planEncrypted" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "payloadErasedAt" TIMESTAMPTZ(3),

    CONSTRAINT "NativeFeedbackRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "R08_request_retention_idx" ON "NativeFeedbackRequest"("tenantId", "retentionUntil");

CREATE UNIQUE INDEX "R08_NativeFeedbackRequest_tenant_uq" ON "NativeFeedbackRequest"("id", "tenantId");

CREATE UNIQUE INDEX "R08_request_identity_uq" ON "NativeFeedbackRequest"("tenantId", "requestIdentityHash");

CREATE UNIQUE INDEX "R08_request_appointment_uq" ON "NativeFeedbackRequest"("tenantId", "appointmentId", "clientId");

CREATE UNIQUE INDEX "R08_request_client_uq" ON "NativeFeedbackRequest"("id", "tenantId", "clientId");

CREATE UNIQUE INDEX "R08_NativeFeedbackRevision_tenant_uq" ON "NativeFeedbackRevision"("id", "tenantId");

CREATE UNIQUE INDEX "R08_revision_version_uq" ON "NativeFeedbackRevision"("tenantId", "requestId", "version");

CREATE UNIQUE INDEX "R08_revision_identity_uq" ON "NativeFeedbackRevision"("tenantId", "requestId", "identityHash");

CREATE UNIQUE INDEX "R08_revision_request_uq" ON "NativeFeedbackRevision"("id", "tenantId", "requestId");

CREATE UNIQUE INDEX "R08_execution_slot_uq" ON "ActionExecution"("tenantId", "nativeFeedbackRequestId", "nativeFeedbackSlotKey");

ALTER TABLE "ActionExecution" ADD CONSTRAINT "R08_execution_request_fk" FOREIGN KEY ("nativeFeedbackRequestId", "tenantId") REFERENCES "NativeFeedbackRequest"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ActionExecution" ADD CONSTRAINT "R08_execution_revision_fk" FOREIGN KEY ("nativeFeedbackRevisionId", "tenantId", "nativeFeedbackRequestId") REFERENCES "NativeFeedbackRevision"("id", "tenantId", "requestId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "NativeFeedbackRequest" ADD CONSTRAINT "R08_NativeFeedbackRequest_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "NativeFeedbackRequest" ADD CONSTRAINT "R08_request_client_fk" FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "NativeFeedbackRequest" ADD CONSTRAINT "R08_request_appointment_fk" FOREIGN KEY ("appointmentId", "tenantId", "clientId") REFERENCES "Appointment"("id", "tenantId", "mayaClientId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "NativeFeedbackRequest" ADD CONSTRAINT "R08_request_member_fk" FOREIGN KEY ("requestedByUserId", "tenantId") REFERENCES "Membership"("userId", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "NativeFeedbackRequest" ADD CONSTRAINT "R08_request_execution_fk" FOREIGN KEY ("requestExecutionId", "tenantId") REFERENCES "ActionExecution"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "NativeFeedbackRevision" ADD CONSTRAINT "R08_NativeFeedbackRevision_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "NativeFeedbackRevision" ADD CONSTRAINT "R08_revision_request_fk" FOREIGN KEY ("requestId", "tenantId", "clientId") REFERENCES "NativeFeedbackRequest"("id", "tenantId", "clientId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "NativeFeedbackRevision" ADD CONSTRAINT "R08_revision_client_fk" FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "NativeFeedbackRevision" ADD CONSTRAINT "R08_revision_execution_fk" FOREIGN KEY ("executionId", "tenantId") REFERENCES "ActionExecution"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "NativeFeedbackRequest" ADD CONSTRAINT "R08_request_contract_check" CHECK (
 "contractVersion"=1 AND "requestIdentityHash" ~ '^[a-f0-9]{64}$' AND "intentHash" ~ '^[a-f0-9]{64}$'
 AND "contentHash" ~ '^[a-f0-9]{64}$' AND "planHash" ~ '^[a-f0-9]{64}$'
 AND revision>=0 AND "latestResponseVersion">=0 AND revision="latestResponseVersion"
 AND state IN ('OPEN','RESPONDED','WITHDRAWN') AND "expiresAt"=GREATEST("createdAt","eligibleAt")+interval '7 days'
 AND "retentionUntil"="createdAt"+interval '365 days'
 AND ((state='WITHDRAWN' AND "closedAt" IS NOT NULL) OR (state<>'WITHDRAWN' AND "closedAt" IS NULL))
);
ALTER TABLE "NativeFeedbackRevision" ADD CONSTRAINT "R08_revision_contract_check" CHECK (
 "identityHash" ~ '^[a-f0-9]{64}$' AND "intentHash" ~ '^[a-f0-9]{64}$' AND "contentHash" ~ '^[a-f0-9]{64}$' AND "planHash" ~ '^[a-f0-9]{64}$'
 AND version>0 AND ((kind='response' AND rating IS NOT NULL AND rating BETWEEN 1 AND 5)
  OR (kind='withdraw' AND rating IS NULL AND "commentEncrypted" IS NULL))
);
ALTER TABLE "ActionExecution" ADD CONSTRAINT "R08_execution_binding_check" CHECK (
 ("nativeFeedbackRequestId" IS NULL AND "nativeFeedbackRevisionId" IS NULL AND "nativeFeedbackSlotKey" IS NULL
  AND capability NOT IN ('communication.native-feedback.invitation.execute.v1','communication.native-feedback.response.execute.v1')) OR
 ("nativeFeedbackRequestId" IS NOT NULL AND "nativeFeedbackSlotKey" IS NOT NULL AND "nativeFeedbackSlotKey" ~ '^[a-f0-9]{64}$'
  AND ((capability='communication.native-feedback.invitation.execute.v1' AND "actionClass"='deliver_report_briefing' AND "nativeFeedbackRevisionId" IS NULL)
   OR (capability='communication.native-feedback.response.execute.v1' AND "actionClass"='deliver_business_alert' AND "nativeFeedbackRevisionId" IS NOT NULL)))
);
CREATE FUNCTION "R08_request_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE accepted "NativeFeedbackRevision"%ROWTYPE;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'OPEN' OR NEW.revision<>0 OR NEW."latestResponseVersion"<>0 OR NEW."contentEncrypted" IS NULL OR NEW."planEncrypted" IS NULL OR NEW."payloadErasedAt" IS NOT NULL
   OR NOT EXISTS (SELECT 1 FROM "Appointment" a WHERE a.id=NEW."appointmentId" AND a."tenantId"=NEW."tenantId" AND a."mayaClientId"=NEW."clientId" AND a.attendance='arrived' AND a.status<>'canceled'
    AND a."endAt" <= (NEW."createdAt" AT TIME ZONE 'UTC') AND (a."endAt" AT TIME ZONE 'UTC')+interval '3 hours'=NEW."eligibleAt")
   OR NOT EXISTS (SELECT 1 FROM "ActionExecution" e JOIN "Membership" m ON m."userId"=e."actorUserId" AND m."tenantId"=e."tenantId" JOIN "User" u ON u.id=m."userId"
    WHERE e.id=NEW."requestExecutionId" AND e."tenantId"=NEW."tenantId" AND e."actorUserId"=NEW."requestedByUserId"
     AND e."actionClass"='request_native_feedback' AND e.state='EXECUTING' AND NOT e."dryRun" AND e."policyDecision"='ALLOW'
     AND m.status='active' AND u.status='active' AND m.role IN ('tenant_owner','business_owner','tenant_admin','administrator')) THEN
   RAISE EXCEPTION 'R08 exact arrived Appointment and admitted management request required' USING ERRCODE='23514';
  END IF; RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW."contentEncrypted" IS NULL AND NEW."planEncrypted" IS NULL AND OLD."payloadErasedAt" IS NULL AND NEW."payloadErasedAt" IS NOT NULL
   AND (to_jsonb(NEW)-ARRAY['contentEncrypted','planEncrypted','payloadErasedAt'])=(to_jsonb(OLD)-ARRAY['contentEncrypted','planEncrypted','payloadErasedAt'])
   AND "RC_payload_claim"(OLD."tenantId",'NativeFeedbackRequest',OLD.id,OLD."planHash",OLD."retentionUntil",'purge_native_feedback_payloads','native-feedback-retention')
   AND "RC_execution_set_resolved"(OLD."tenantId",ARRAY(SELECT id FROM "ActionExecution" WHERE "tenantId"=OLD."tenantId" AND (id=OLD."requestExecutionId" OR "nativeFeedbackRequestId"=OLD.id OR id IN (SELECT "executionId" FROM "NativeFeedbackRevision" WHERE "tenantId"=OLD."tenantId" AND "requestId"=OLD.id)))) THEN RETURN NEW; END IF;
  SELECT * INTO accepted FROM "NativeFeedbackRevision" WHERE "tenantId"=OLD."tenantId" AND "requestId"=OLD.id AND version=NEW."latestResponseVersion";
  IF (to_jsonb(NEW)-ARRAY['state','revision','latestResponseVersion','closedAt'])=(to_jsonb(OLD)-ARRAY['state','revision','latestResponseVersion','closedAt'])
   AND NEW.revision=OLD.revision+1 AND NEW."latestResponseVersion"=OLD."latestResponseVersion"+1 AND accepted.id IS NOT NULL
   AND NEW.state=(CASE WHEN accepted.kind='withdraw' THEN 'WITHDRAWN' ELSE 'RESPONDED' END)
   AND EXISTS (SELECT 1 FROM "NativeFeedbackRevision" WHERE id=accepted.id AND xmin=pg_current_xact_id()::xid)
  THEN RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION 'R08 immutable request / response CAS / scoped retention required' USING ERRCODE='23514';
END $$;
CREATE TRIGGER "R08_request_guard" BEFORE INSERT OR UPDATE OR DELETE ON "NativeFeedbackRequest" FOR EACH ROW EXECUTE FUNCTION "R08_request_guard"();
CREATE CONSTRAINT TRIGGER "R08_request_receipt" AFTER INSERT ON "NativeFeedbackRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "RC_confirmed_owner_receipt"('requestExecutionId');
CREATE FUNCTION "R08_revision_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root "NativeFeedbackRequest"%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'R08 response tombstone retained' USING ERRCODE='23514'; END IF;
 SELECT * INTO root FROM "NativeFeedbackRequest" WHERE id=NEW."requestId" AND "tenantId"=NEW."tenantId" FOR UPDATE;
 IF TG_OP='INSERT' THEN
  IF root.id IS NULL OR root."clientId"<>NEW."clientId" OR NEW.version<>root."latestResponseVersion"+1
   OR (NEW.kind='response' AND NEW."createdAt">root."expiresAt") OR NEW."planEncrypted" IS NULL OR NEW."payloadErasedAt" IS NOT NULL
   OR NOT EXISTS (SELECT 1 FROM "ActionExecution" e WHERE e.id=NEW."executionId" AND e."tenantId"=NEW."tenantId" AND e.state='EXECUTING' AND NOT e."dryRun" AND e."policyDecision"='ALLOW'
    AND e."actionClass"=CASE WHEN NEW.kind='withdraw' THEN 'withdraw_native_feedback' ELSE 'submit_native_feedback_revision' END)
   OR NOT EXISTS (SELECT 1 FROM "ActionExecution" WHERE id=root."requestExecutionId" AND "tenantId"=root."tenantId" AND state='SUCCEEDED') THEN
   RAISE EXCEPTION 'R08 exact admitted Client response / current revision required' USING ERRCODE='23514';
  END IF; RETURN NEW;
 END IF;
 IF NEW."commentEncrypted" IS NULL AND NEW."planEncrypted" IS NULL AND OLD."payloadErasedAt" IS NULL AND NEW."payloadErasedAt" IS NOT NULL
  AND (to_jsonb(NEW)-ARRAY['commentEncrypted','planEncrypted','payloadErasedAt'])=(to_jsonb(OLD)-ARRAY['commentEncrypted','planEncrypted','payloadErasedAt'])
  AND "RC_payload_claim"(OLD."tenantId",'NativeFeedbackRevision',OLD.id,OLD."planHash",root."retentionUntil",'purge_native_feedback_payloads','native-feedback-retention')
  AND "RC_execution_set_resolved"(OLD."tenantId",ARRAY(SELECT id FROM "ActionExecution" WHERE "tenantId"=OLD."tenantId" AND (id=OLD."executionId" OR "nativeFeedbackRevisionId"=OLD.id))) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'R08 immutable response / exact payload claim required' USING ERRCODE='23514';
END $$;
CREATE TRIGGER "R08_revision_guard" BEFORE INSERT OR UPDATE OR DELETE ON "NativeFeedbackRevision" FOR EACH ROW EXECUTE FUNCTION "R08_revision_guard"();
CREATE CONSTRAINT TRIGGER "R08_revision_receipt" AFTER INSERT ON "NativeFeedbackRevision" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "RC_confirmed_owner_receipt"('executionId');
CREATE FUNCTION "R08_execution_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_execution text;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD."nativeFeedbackRequestId" IS NOT NULL THEN RAISE EXCEPTION 'R08 delivery evidence retained' USING ERRCODE='23514'; END IF; RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW."nativeFeedbackRequestId" IS DISTINCT FROM OLD."nativeFeedbackRequestId" OR NEW."nativeFeedbackRevisionId" IS DISTINCT FROM OLD."nativeFeedbackRevisionId" OR NEW."nativeFeedbackSlotKey" IS DISTINCT FROM OLD."nativeFeedbackSlotKey" THEN RAISE EXCEPTION 'R08 immutable delivery slot binding' USING ERRCODE='23514'; END IF; RETURN NEW;
 END IF;
 IF NEW."nativeFeedbackRequestId" IS NULL THEN RETURN NEW; END IF;
 IF NEW."nativeFeedbackRevisionId" IS NULL THEN
  SELECT "requestExecutionId" INTO parent_execution FROM "NativeFeedbackRequest" WHERE id=NEW."nativeFeedbackRequestId" AND "tenantId"=NEW."tenantId" AND "planEncrypted" IS NOT NULL;
 ELSE
  SELECT "executionId" INTO parent_execution FROM "NativeFeedbackRevision" WHERE id=NEW."nativeFeedbackRevisionId" AND "tenantId"=NEW."tenantId" AND "requestId"=NEW."nativeFeedbackRequestId" AND "planEncrypted" IS NOT NULL AND kind='response';
 END IF;
 IF parent_execution IS NULL OR NEW.state<>'READY' OR NEW."dryRun" OR NEW."policyDecision"<>'ALLOW' OR NOT EXISTS (SELECT 1 FROM "ActionExecution" WHERE id=parent_execution AND "tenantId"=NEW."tenantId" AND state='SUCCEEDED') THEN
  RAISE EXCEPTION 'R08 confirmed parent and complete slot admission required' USING ERRCODE='23514';
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER "R08_execution_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ActionExecution" FOR EACH ROW EXECUTE FUNCTION "R08_execution_guard"();

CREATE FUNCTION "R08_revision_projection_receipt"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root "NativeFeedbackRequest"%ROWTYPE; latest "NativeFeedbackRevision"%ROWTYPE;
BEGIN
 SELECT * INTO root FROM "NativeFeedbackRequest" WHERE id=NEW."requestId" AND "tenantId"=NEW."tenantId";
 SELECT * INTO latest FROM "NativeFeedbackRevision" WHERE "requestId"=NEW."requestId" AND "tenantId"=NEW."tenantId" ORDER BY version DESC LIMIT 1;
 IF root."latestResponseVersion"<>latest.version OR root.revision<>latest.version OR
  root.state<>(CASE WHEN latest.kind='withdraw' THEN 'WITHDRAWN' ELSE 'RESPONDED' END) THEN
  RAISE EXCEPTION 'R08 accepted revision and exact current projection must commit together' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "R08_revision_projection_receipt" AFTER INSERT ON "NativeFeedbackRevision" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "R08_revision_projection_receipt"();

COMMIT;
