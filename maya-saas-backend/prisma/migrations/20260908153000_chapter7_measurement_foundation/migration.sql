BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Approved at 7ed07b6c + owner schema approval: prospective; no source writes/backfill.
CREATE TABLE "MeasurementRevision" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "identityHash" CHAR(64) NOT NULL,
  "revision" INTEGER NOT NULL,
  "requestKeyHash" CHAR(64) NOT NULL,
  "intentHash" CHAR(64) NOT NULL,
  "ruleKey" TEXT NOT NULL,
  "ruleVersion" INTEGER NOT NULL,
  "clientId" TEXT,
  "appointmentId" TEXT,
  "staffId" TEXT,
  "branchId" TEXT,
  "configurationUserId" TEXT,
  "periodFrom" TIMESTAMPTZ(3) NOT NULL,
  "periodTo" TIMESTAMPTZ(3) NOT NULL,
  "timezone" TEXT NOT NULL,
  "scopeJson" JSONB NOT NULL,
  "asOf" TIMESTAMPTZ(3) NOT NULL,
  "admittedAt" TIMESTAMPTZ(3) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "leaseGeneration" INTEGER NOT NULL DEFAULT 0,
  "leaseTokenHash" CHAR(64),
  "leaseExpiresAt" TIMESTAMPTZ(3),
  "publishedAt" TIMESTAMPTZ(3),
  "contractVersion" INTEGER NOT NULL DEFAULT 1,
  "evidenceHash" CHAR(64),
  "snapshotHash" CHAR(64),
  "completeness" TEXT,
  "qualification" TEXT,
  "evidenceRefsJson" JSONB,
  "valuesJson" JSONB,
  "limitationsJson" JSONB,
  "attributionStatus" TEXT,
  "creditedExecutionId" TEXT,
  "creditedAttemptId" TEXT,
  CONSTRAINT "MeasurementRevision_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "MeasurementRevision" ADD CONSTRAINT "C7_measurement_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "MeasurementRevision" ADD CONSTRAINT "C7_measurement_client_fk" FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client" ("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "MeasurementRevision" ADD CONSTRAINT "C7_measurement_appointment_fk" FOREIGN KEY ("appointmentId", "tenantId", "clientId") REFERENCES "Appointment" ("id", "tenantId", "mayaClientId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "MeasurementRevision" ADD CONSTRAINT "C7_measurement_staff_fk" FOREIGN KEY ("staffId", "tenantId") REFERENCES "Staff" ("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "MeasurementRevision" ADD CONSTRAINT "C7_measurement_branch_fk" FOREIGN KEY ("branchId", "tenantId") REFERENCES "Branch" ("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "MeasurementRevision" ADD CONSTRAINT "C7_measurement_config_owner_fk" FOREIGN KEY ("configurationUserId", "tenantId") REFERENCES "Membership" ("userId", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "MeasurementRevision" ADD CONSTRAINT "C7_measurement_execution_fk" FOREIGN KEY ("creditedExecutionId", "tenantId") REFERENCES "ActionExecution" ("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "MeasurementRevision" ADD CONSTRAINT "C7_measurement_attempt_fk" FOREIGN KEY ("creditedAttemptId", "tenantId") REFERENCES "ActionAttempt" ("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "C7_measurement_id_tenant_uq" ON "MeasurementRevision" ("id", "tenantId");
CREATE UNIQUE INDEX "C7_measurement_generation_uq" ON "MeasurementRevision" ("tenantId", "identityHash", "revision");
CREATE UNIQUE INDEX "C7_measurement_request_uq" ON "MeasurementRevision" ("tenantId", "requestKeyHash");
CREATE UNIQUE INDEX "C7_measurement_pending_uq" ON "MeasurementRevision" ("tenantId", "identityHash") WHERE state = 'PENDING';
CREATE INDEX "C7_measurement_period_idx" ON "MeasurementRevision" ("tenantId", "kind", "periodFrom", "periodTo");
CREATE INDEX "C7_measurement_client_idx" ON "MeasurementRevision" ("tenantId", "clientId", "kind", "asOf");
CREATE INDEX "C7_measurement_staff_idx" ON "MeasurementRevision" ("tenantId", "staffId", "kind", "asOf");
CREATE INDEX "C7_measurement_expiry_idx" ON "MeasurementRevision" ("expiresAt", "id");
CREATE INDEX "C7_measurement_execution_idx" ON "MeasurementRevision" ("tenantId", "creditedExecutionId");
CREATE INDEX "C7_measurement_attempt_idx" ON "MeasurementRevision" ("tenantId", "creditedAttemptId");

ALTER TABLE "MeasurementRevision"
 ADD CONSTRAINT "C7_measurement_kind_ck" CHECK (kind IN ('appointment_outcome','client_history','business_period','staff_goal','reputation_period','execution_funnel','value_discrepancy')),
 ADD CONSTRAINT "C7_measurement_hashes_ck" CHECK (
   "identityHash" ~ '^[0-9a-f]{64}$' AND "requestKeyHash" ~ '^[0-9a-f]{64}$' AND "intentHash" ~ '^[0-9a-f]{64}$'
   AND ("leaseTokenHash" IS NULL OR "leaseTokenHash" ~ '^[0-9a-f]{64}$')
   AND ("evidenceHash" IS NULL OR "evidenceHash" ~ '^[0-9a-f]{64}$')
   AND ("snapshotHash" IS NULL OR "snapshotHash" ~ '^[0-9a-f]{64}$')),
 ADD CONSTRAINT "C7_measurement_versions_ck" CHECK (revision > 0 AND "ruleVersion" > 0 AND "contractVersion" > 0 AND "leaseGeneration" >= 0),
 ADD CONSTRAINT "C7_measurement_rule_ck" CHECK ("ruleKey" = 'c7.' || replace(kind, '_', '-')),
 ADD CONSTRAINT "C7_measurement_period_ck" CHECK ("periodFrom" < "periodTo" AND "asOf" <= "admittedAt"),
 ADD CONSTRAINT "C7_measurement_timezone_ck" CHECK (length(timezone) BETWEEN 1 AND 100),
 ADD CONSTRAINT "C7_measurement_retention_ck" CHECK ("expiresAt" = "admittedAt" + interval '31536000 seconds'),
 ADD CONSTRAINT "C7_measurement_state_ck" CHECK (state IN ('PENDING','PUBLISHED')),
 ADD CONSTRAINT "C7_measurement_lease_ck" CHECK (
   (("leaseTokenHash" IS NULL AND "leaseExpiresAt" IS NULL) OR
    ("leaseTokenHash" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL AND "leaseExpiresAt" <= "expiresAt"))
   AND (state <> 'PUBLISHED' OR ("leaseTokenHash" IS NULL AND "leaseExpiresAt" IS NULL))),
 ADD CONSTRAINT "C7_measurement_publication_ck" CHECK (
   (state='PENDING' AND "publishedAt" IS NULL AND "evidenceHash" IS NULL AND "snapshotHash" IS NULL
    AND completeness IS NULL AND qualification IS NULL AND "evidenceRefsJson" IS NULL
    AND "valuesJson" IS NULL AND "limitationsJson" IS NULL AND "attributionStatus" IS NULL
    AND "creditedExecutionId" IS NULL AND "creditedAttemptId" IS NULL)
   OR (state='PUBLISHED' AND "publishedAt" IS NOT NULL AND "publishedAt" >= "admittedAt" AND "publishedAt" < "expiresAt"
    AND "evidenceHash" IS NOT NULL AND "snapshotHash" IS NOT NULL AND completeness IS NOT NULL
    AND qualification IS NOT NULL AND "evidenceRefsJson" IS NOT NULL AND "valuesJson" IS NOT NULL
    AND "limitationsJson" IS NOT NULL AND "attributionStatus" IS NOT NULL)),
 ADD CONSTRAINT "C7_measurement_completeness_ck" CHECK (completeness IS NULL OR completeness IN ('COMPLETE','PARTIAL','UNAVAILABLE','NOT_MEASURED')),
 ADD CONSTRAINT "C7_measurement_qualification_ck" CHECK (qualification IS NULL OR qualification IN ('VERIFIED','SOURCE_LABELLED','UNQUALIFIED')),
 ADD CONSTRAINT "C7_measurement_attribution_ck" CHECK (
   ("attributionStatus" IS NULL OR "attributionStatus" IN ('NOT_APPLICABLE','UNATTRIBUTED','AMBIGUOUS','ATTRIBUTED'))
   AND (("creditedExecutionId" IS NULL AND "creditedAttemptId" IS NULL AND coalesce("attributionStatus",'') <> 'ATTRIBUTED')
     OR ("creditedExecutionId" IS NOT NULL AND "creditedAttemptId" IS NOT NULL AND "attributionStatus"='ATTRIBUTED' AND kind='appointment_outcome' AND qualification='VERIFIED'))),
 ADD CONSTRAINT "C7_measurement_subject_ck" CHECK (
   ("appointmentId" IS NULL OR "clientId" IS NOT NULL)
   AND (kind <> 'appointment_outcome' OR ("appointmentId" IS NOT NULL AND "clientId" IS NOT NULL))
   AND (kind <> 'client_history' OR "clientId" IS NOT NULL)
   AND (kind <> 'staff_goal' OR ("staffId" IS NOT NULL AND "configurationUserId" IS NOT NULL))),
 ADD CONSTRAINT "C7_measurement_json_ck" CHECK (coalesce(
   jsonb_typeof("scopeJson")='object' AND "scopeJson"->>'version'='1'
   AND ("scopeJson" - ARRAY['version','capabilityKey','branchIds','dimensions','sourceQuery'])='{}'::jsonb
   AND jsonb_typeof("scopeJson"->'branchIds')='array' AND jsonb_typeof("scopeJson"->'dimensions')='object'
   AND jsonb_typeof("scopeJson"->'sourceQuery')='object'
   AND (state='PENDING' OR (
     jsonb_typeof("evidenceRefsJson")='object' AND "evidenceRefsJson"->>'version'='1'
     AND ("evidenceRefsJson" - ARRAY['version','sources','dependencies'])='{}'::jsonb
     AND jsonb_typeof("evidenceRefsJson"->'sources')='array' AND jsonb_typeof("evidenceRefsJson"->'dependencies')='array'
     AND jsonb_typeof("valuesJson")='object' AND "valuesJson"->>'version'='1'
     AND ("valuesJson" - ARRAY['version','metrics'])='{}'::jsonb AND jsonb_typeof("valuesJson"->'metrics')='array'
     AND jsonb_typeof("limitationsJson")='object' AND "limitationsJson"->>'version'='1'
     AND ("limitationsJson" - ARRAY['version','reasons'])='{}'::jsonb AND jsonb_typeof("limitationsJson"->'reasons')='array'
   )),false)),
 ADD CONSTRAINT "C7_measurement_bounds_ck" CHECK (
   length("tenantId") BETWEEN 1 AND 240 AND octet_length("scopeJson"::text) <= 16384
   AND length(coalesce("scopeJson"->>'capabilityKey','')) BETWEEN 1 AND 100
   AND (state='PENDING' OR coalesce(
     octet_length("evidenceRefsJson"::text)+octet_length("valuesJson"::text)+octet_length("limitationsJson"::text) <= 262144
     AND jsonb_array_length("evidenceRefsJson"->'sources')+jsonb_array_length("evidenceRefsJson"->'dependencies') <= 1000
     AND jsonb_array_length("valuesJson"->'metrics') <= 256,false)));

CREATE FUNCTION "C7_measurement_admission_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected text; head integer; branch_ref text;
BEGIN
 -- Lock current authority through the derived admission/publication transaction.
 PERFORM id FROM "Tenant" WHERE id=NEW."tenantId" AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'C7 tenant authority revoked' USING ERRCODE='23514'; END IF;
 IF NEW."clientId" IS NOT NULL THEN
   PERFORM id FROM "Client" WHERE id=NEW."clientId" AND "tenantId"=NEW."tenantId" AND "mergedIntoClientId" IS NULL FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'C7 Client authority revoked' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW."staffId" IS NOT NULL THEN
   PERFORM id FROM "Staff" WHERE id=NEW."staffId" AND "tenantId"=NEW."tenantId" AND active FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'C7 Staff authority revoked' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW."configurationUserId" IS NOT NULL THEN
   PERFORM id FROM "Membership" WHERE "userId"=NEW."configurationUserId" AND "tenantId"=NEW."tenantId" AND status='active' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'C7 configuration authority revoked' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.state <> 'PENDING' OR NEW."leaseGeneration" <> 0 OR NEW."leaseTokenHash" IS NOT NULL
    OR NEW."ruleVersion" <> 1 OR NEW."contractVersion" <> 1 THEN
   RAISE EXCEPTION 'C7 invalid initial admission' USING ERRCODE='23514';
 END IF;
 IF NEW."admittedAt" < date_trunc('milliseconds',statement_timestamp()) - interval '5 seconds'
    OR NEW."admittedAt" > date_trunc('milliseconds',clock_timestamp()) THEN
   RAISE EXCEPTION 'C7 prospective server admission required' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=NEW.timezone) THEN
   RAISE EXCEPTION 'C7 invalid timezone' USING ERRCODE='23514';
 END IF;
 expected=encode(sha256(convert_to(jsonb_build_array('c7.measurement.identity/1',NEW."tenantId",NEW.kind,
   CASE WHEN NEW.kind='appointment_outcome' THEN jsonb_build_array(NEW."appointmentId")
   ELSE jsonb_build_array(NEW."clientId",NEW."staffId",NEW."configurationUserId",NEW."branchId",
     floor(extract(epoch FROM NEW."periodFrom")*1000)::bigint,
     floor(extract(epoch FROM NEW."periodTo")*1000)::bigint,NEW.timezone,NEW."scopeJson") END)::text,'UTF8')),'hex');
 IF NEW."identityHash" <> expected THEN
   RAISE EXCEPTION 'C7 logical identity mismatch' USING ERRCODE='23514';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('c7.measurement/' || NEW."tenantId" || '/' || expected,0));
 SELECT coalesce(max(revision),0) INTO head FROM "MeasurementRevision" WHERE "tenantId"=NEW."tenantId" AND "identityHash"=expected;
 IF NEW.revision <> head+1 THEN RAISE EXCEPTION 'C7 revision generation mismatch' USING ERRCODE='23514'; END IF;
 FOR branch_ref IN SELECT jsonb_array_elements_text(NEW."scopeJson"->'branchIds') LOOP
   IF NOT EXISTS (SELECT 1 FROM "Branch" WHERE id=branch_ref AND "tenantId"=NEW."tenantId") THEN
     RAISE EXCEPTION 'C7 branch scope mismatch' USING ERRCODE='23514';
   END IF;
 END LOOP;
 IF NEW."staffId" IS NOT NULL AND NEW."branchId" IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM "Staff" WHERE id=NEW."staffId" AND "tenantId"=NEW."tenantId" AND "branchId"=NEW."branchId") THEN
   RAISE EXCEPTION 'C7 Staff branch mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "C7_measurement_admission_guard_trg" BEFORE INSERT ON "MeasurementRevision"
 FOR EACH ROW EXECUTE FUNCTION "C7_measurement_admission_guard"();

CREATE FUNCTION "C7_measurement_publication_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed text[]; claim text; item jsonb;
BEGIN
 -- Lock current authority through the derived admission/publication transaction.
 PERFORM id FROM "Tenant" WHERE id=NEW."tenantId" AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'C7 tenant authority revoked' USING ERRCODE='23514'; END IF;
 IF NEW."clientId" IS NOT NULL THEN
   PERFORM id FROM "Client" WHERE id=NEW."clientId" AND "tenantId"=NEW."tenantId" AND "mergedIntoClientId" IS NULL FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'C7 Client authority revoked' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW."staffId" IS NOT NULL THEN
   PERFORM id FROM "Staff" WHERE id=NEW."staffId" AND "tenantId"=NEW."tenantId" AND active FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'C7 Staff authority revoked' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW."configurationUserId" IS NOT NULL THEN
   PERFORM id FROM "Membership" WHERE "userId"=NEW."configurationUserId" AND "tenantId"=NEW."tenantId" AND status='active' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'C7 configuration authority revoked' USING ERRCODE='23514'; END IF;
 END IF;
 IF OLD.state='PUBLISHED' THEN RAISE EXCEPTION 'C7 snapshot immutable' USING ERRCODE='23514'; END IF;
 allowed=ARRAY['state','leaseGeneration','leaseTokenHash','leaseExpiresAt','publishedAt','evidenceHash','snapshotHash','completeness','qualification','evidenceRefsJson','valuesJson','limitationsJson','attributionStatus','creditedExecutionId','creditedAttemptId'];
 IF (to_jsonb(NEW)-allowed) IS DISTINCT FROM (to_jsonb(OLD)-allowed) THEN
   RAISE EXCEPTION 'C7 admitted intent immutable' USING ERRCODE='23514';
 END IF;
 IF OLD."expiresAt" <= clock_timestamp() THEN RAISE EXCEPTION 'C7 intent expired' USING ERRCODE='23514'; END IF;
 IF NEW.state='PENDING' THEN
   IF OLD."leaseExpiresAt">clock_timestamp() OR NEW."leaseGeneration"<>OLD."leaseGeneration"+1
      OR NEW."leaseTokenHash" IS NULL OR NEW."leaseExpiresAt"<=clock_timestamp()
      OR NEW."leaseExpiresAt">clock_timestamp()+interval '60 seconds' THEN
     RAISE EXCEPTION 'C7 claim fenced' USING ERRCODE='23514';
   END IF;
 ELSE
   claim=current_setting('maya.c7.claim_token',true);
   IF claim IS NULL OR OLD."leaseTokenHash" IS NULL OR OLD."leaseExpiresAt" IS NULL
      OR encode(sha256(convert_to(claim,'UTF8')),'hex')<>OLD."leaseTokenHash"
      OR OLD."leaseExpiresAt"<=clock_timestamp() OR NEW."leaseGeneration"<>OLD."leaseGeneration"
      OR NEW."publishedAt"<statement_timestamp()-interval '5 seconds' OR NEW."publishedAt">clock_timestamp() THEN
     RAISE EXCEPTION 'C7 publication fenced' USING ERRCODE='23514';
   END IF;
   IF NEW."creditedAttemptId" IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM "ActionAttempt" a JOIN "ActionExecution" e ON e.id=a."actionExecutionId" AND e."tenantId"=a."tenantId"
     WHERE a.id=NEW."creditedAttemptId" AND a."tenantId"=NEW."tenantId" AND e.id=NEW."creditedExecutionId"
       AND e.state='SUCCEEDED' AND NOT e."dryRun" AND e."policyDecision"='ALLOW'
       AND e."reconciliationState" IN ('NOT_REQUIRED','RESOLVED') AND a.state='SUCCEEDED') THEN
     RAISE EXCEPTION 'C7 exact confirmed effect receipt required' USING ERRCODE='23514';
   END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(NEW."evidenceRefsJson"->'sources') LOOP
     IF item->>'tenantId' IS DISTINCT FROM NEW."tenantId" THEN
       RAISE EXCEPTION 'C7 evidence tenant mismatch' USING ERRCODE='23514';
     END IF;
   END LOOP;
   FOR item IN SELECT value FROM jsonb_array_elements(NEW."evidenceRefsJson"->'dependencies') LOOP
     IF NOT EXISTS (SELECT 1 FROM "MeasurementRevision" r WHERE r.id::text=item->>'id' AND r."tenantId"=NEW."tenantId"
       AND r.state='PUBLISHED' AND r."snapshotHash"=item->>'snapshotHash' AND r."expiresAt">clock_timestamp()
       AND r."identityHash"=item->>'identityHash' AND r."asOf"=(item->>'asOf')::timestamptz
       AND r."expiresAt"=(item->>'expiresAt')::timestamptz
       AND (NEW.qualification<>'VERIFIED' OR r.qualification='VERIFIED')
       AND (NEW.completeness<>'COMPLETE' OR r.completeness='COMPLETE')) THEN
       RAISE EXCEPTION 'C7 dependency snapshot mismatch' USING ERRCODE='23514';
     END IF;
   END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "C7_measurement_publication_guard_trg" BEFORE UPDATE ON "MeasurementRevision"
 FOR EACH ROW EXECUTE FUNCTION "C7_measurement_publication_guard"();

CREATE FUNCTION "C7_measurement_delete_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT "RC_payload_claim"(OLD."tenantId",'MeasurementRevision',OLD.id::text,
      coalesce(OLD."snapshotHash",OLD."intentHash"),OLD."expiresAt",'expire_measurement_revisions','chapter7.measurement-retention') THEN
   RAISE EXCEPTION 'C7 exact AC6 retention claim required' USING ERRCODE='23514';
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER "C7_measurement_delete_guard_trg" BEFORE DELETE ON "MeasurementRevision"
 FOR EACH ROW EXECUTE FUNCTION "C7_measurement_delete_guard"();
CREATE FUNCTION "C7_measurement_truncate_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'C7 truncate forbidden' USING ERRCODE='23514'; END $$;
CREATE TRIGGER "C7_measurement_truncate_guard_trg" BEFORE TRUNCATE ON "MeasurementRevision"
 FOR EACH STATEMENT EXECUTE FUNCTION "C7_measurement_truncate_guard"();
COMMIT;
