BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
-- Approved C8 limited-data envelope: 3 tables, 94 columns; prospective, no backfill.
CREATE TABLE "C8ModelVersion" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "modelKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "contractVersion" INTEGER NOT NULL,
  "manifestHash" CHAR(64) NOT NULL,
  "artifactHash" CHAR(64) NOT NULL,
  "featureContractHash" CHAR(64) NOT NULL,
  "evaluationContractHash" CHAR(64) NOT NULL,
  "targetKey" TEXT NOT NULL,
  "targetJson" JSONB NOT NULL,
  "scopeJson" JSONB NOT NULL,
  "methodJson" JSONB NOT NULL,
  "parametersJson" JSONB NOT NULL,
  "trainingEvidenceJson" JSONB NOT NULL,
  "informationCutoffAt" TIMESTAMPTZ(3) NOT NULL,
  "trainingMode" TEXT NOT NULL,
  "releaseDigest" CHAR(64) NOT NULL,
  "requestKeyHash" CHAR(64) NOT NULL,
  "intentHash" CHAR(64) NOT NULL,
  "admittedAt" TIMESTAMPTZ(3) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "C8ModelVersion_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "C8ModelVersion" ADD CONSTRAINT "C8_model_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "C8_model_id_tenant_uq" ON "C8ModelVersion" ("id", "tenantId");
CREATE UNIQUE INDEX "C8_model_version_uq" ON "C8ModelVersion" ("tenantId", "modelKey", "version");
CREATE UNIQUE INDEX "C8_model_request_uq" ON "C8ModelVersion" ("tenantId", "requestKeyHash");
CREATE UNIQUE INDEX "C8_model_manifest_uq" ON "C8ModelVersion" ("tenantId", "manifestHash");
CREATE INDEX "C8_model_target_idx" ON "C8ModelVersion" ("tenantId", "targetKey", "admittedAt");
CREATE INDEX "C8_model_expiry_idx" ON "C8ModelVersion" ("expiresAt", "id");
CREATE TABLE "C8ResultRevision" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "subjectKind" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "identityHash" CHAR(64) NOT NULL,
  "revision" INTEGER NOT NULL,
  "intentHash" CHAR(64) NOT NULL,
  "contractVersion" INTEGER NOT NULL,
  "ruleKey" TEXT NOT NULL,
  "ruleVersion" INTEGER NOT NULL,
  "modelVersionId" UUID,
  "modelManifestHash" CHAR(64),
  "policyRevisionId" TEXT NOT NULL,
  "policyContentHash" CHAR(64) NOT NULL,
  "t0" TIMESTAMPTZ(3) NOT NULL,
  "horizonEnd" TIMESTAMPTZ(3),
  "periodFrom" TIMESTAMPTZ(3) NOT NULL,
  "periodTo" TIMESTAMPTZ(3) NOT NULL,
  "timezone" TEXT NOT NULL,
  "scopeJson" JSONB NOT NULL,
  "basis" TEXT NOT NULL,
  "currency" TEXT,
  "inputHash" CHAR(64) NOT NULL,
  "inputSnapshotJson" JSONB NOT NULL,
  "evidenceRefsJson" JSONB NOT NULL,
  "completeness" TEXT NOT NULL,
  "qualification" TEXT NOT NULL,
  "eligibility" TEXT NOT NULL,
  "admittedAt" TIMESTAMPTZ(3) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "state" TEXT NOT NULL,
  "leaseGeneration" INTEGER NOT NULL,
  "leaseTokenHash" CHAR(64),
  "leaseExpiresAt" TIMESTAMPTZ(3),
  "publishedAt" TIMESTAMPTZ(3),
  "snapshotHash" CHAR(64),
  "valuesJson" JSONB,
  "uncertaintyJson" JSONB,
  "reasonsJson" JSONB,
  "rankingJson" JSONB,
  CONSTRAINT "C8ResultRevision_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "C8ResultRevision" ADD CONSTRAINT "C8_result_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "C8_result_id_tenant_uq" ON "C8ResultRevision" ("id", "tenantId");
CREATE UNIQUE INDEX "C8_result_revision_uq" ON "C8ResultRevision" ("tenantId", "identityHash", "revision");
CREATE UNIQUE INDEX "C8_result_intent_uq" ON "C8ResultRevision" ("tenantId", "intentHash");
CREATE INDEX "C8_result_subject_idx" ON "C8ResultRevision" ("tenantId", "subjectKind", "subjectId", "t0");
CREATE INDEX "C8_result_period_idx" ON "C8ResultRevision" ("tenantId", "kind", "periodFrom", "periodTo");
CREATE INDEX "C8_result_claim_idx" ON "C8ResultRevision" ("tenantId", "state", "leaseExpiresAt");
CREATE INDEX "C8_result_expiry_idx" ON "C8ResultRevision" ("expiresAt", "id");
CREATE INDEX "C8_result_model_idx" ON "C8ResultRevision" ("tenantId", "modelVersionId");
CREATE TABLE "C8EvaluationRevision" (
  "id" UUID NOT NULL,
  "tenantId" TEXT NOT NULL,
  "modelVersionId" UUID NOT NULL,
  "modelManifestHash" CHAR(64) NOT NULL,
  "identityHash" CHAR(64) NOT NULL,
  "revision" INTEGER NOT NULL,
  "intentHash" CHAR(64) NOT NULL,
  "contractVersion" INTEGER NOT NULL,
  "evaluationContractHash" CHAR(64) NOT NULL,
  "mode" TEXT NOT NULL,
  "targetKey" TEXT NOT NULL,
  "scopeJson" JSONB NOT NULL,
  "t0From" TIMESTAMPTZ(3) NOT NULL,
  "t0To" TIMESTAMPTZ(3) NOT NULL,
  "labelsAsOf" TIMESTAMPTZ(3) NOT NULL,
  "admittedAt" TIMESTAMPTZ(3) NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "state" TEXT NOT NULL,
  "leaseGeneration" INTEGER NOT NULL,
  "leaseTokenHash" CHAR(64),
  "leaseExpiresAt" TIMESTAMPTZ(3),
  "publishedAt" TIMESTAMPTZ(3),
  "snapshotHash" CHAR(64),
  "casesJson" JSONB NOT NULL,
  "evidenceHash" CHAR(64) NOT NULL,
  "countsJson" JSONB NOT NULL,
  "metricsJson" JSONB,
  "calibrationJson" JSONB,
  "driftJson" JSONB,
  "outcome" TEXT,
  "reasonsJson" JSONB,
  CONSTRAINT "C8EvaluationRevision_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "C8EvaluationRevision" ADD CONSTRAINT "C8_eval_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE UNIQUE INDEX "C8_eval_id_tenant_uq" ON "C8EvaluationRevision" ("id", "tenantId");
CREATE UNIQUE INDEX "C8_eval_revision_uq" ON "C8EvaluationRevision" ("tenantId", "identityHash", "revision");
CREATE UNIQUE INDEX "C8_eval_intent_uq" ON "C8EvaluationRevision" ("tenantId", "intentHash");
CREATE INDEX "C8_eval_period_idx" ON "C8EvaluationRevision" ("tenantId", "modelVersionId", "t0From", "t0To");
CREATE INDEX "C8_eval_claim_idx" ON "C8EvaluationRevision" ("tenantId", "state", "leaseExpiresAt");
CREATE INDEX "C8_eval_expiry_idx" ON "C8EvaluationRevision" ("expiresAt", "id");
ALTER TABLE "C8ModelVersion" ADD CONSTRAINT "C8_model_contract_ck" CHECK (coalesce((version>0 AND "contractVersion"=1 AND length("modelKey") BETWEEN 1 AND 120),false));
ALTER TABLE "C8ModelVersion" ADD CONSTRAINT "C8_model_hashes_ck" CHECK (coalesce((("manifestHash" IS NULL OR "manifestHash" ~ '^[0-9a-f]{64}$') AND ("artifactHash" IS NULL OR "artifactHash" ~ '^[0-9a-f]{64}$') AND ("featureContractHash" IS NULL OR "featureContractHash" ~ '^[0-9a-f]{64}$') AND ("evaluationContractHash" IS NULL OR "evaluationContractHash" ~ '^[0-9a-f]{64}$') AND ("releaseDigest" IS NULL OR "releaseDigest" ~ '^[0-9a-f]{64}$') AND ("requestKeyHash" IS NULL OR "requestKeyHash" ~ '^[0-9a-f]{64}$') AND ("intentHash" IS NULL OR "intentHash" ~ '^[0-9a-f]{64}$')),false));
ALTER TABLE "C8ModelVersion" ADD CONSTRAINT "C8_model_time_ck" CHECK (coalesce(("expiresAt">"admittedAt" AND "expiresAt"<="admittedAt"+interval '31536000 seconds' AND "informationCutoffAt"<="admittedAt"),false));
ALTER TABLE "C8ModelVersion" ADD CONSTRAINT "C8_model_target_ck" CHECK (coalesce(("targetKey" IN ('attended_return','appointment_no_show','client_expected_value','business_revenue','staff_earnings_conditional','observed_booking_demand','scheduled_utilization','statistical_deviation')),false));
ALTER TABLE "C8ModelVersion" ADD CONSTRAINT "C8_model_mode_ck" CHECK (coalesce(("trainingMode" IN ('PROSPECTIVE','QUALIFIED_BACKTEST')),false));
ALTER TABLE "C8ModelVersion" ADD CONSTRAINT "C8_model_payload_ck" CHECK (coalesce((jsonb_typeof("targetJson")='object' AND jsonb_typeof("scopeJson")='object' AND jsonb_typeof("methodJson")='object' AND jsonb_typeof("parametersJson")='object' AND jsonb_typeof("trainingEvidenceJson")='object' AND "targetJson"->>'targetKey'="targetKey" AND "scopeJson"->>'tenantId'="tenantId" AND length("methodJson"->>'methodKey')>0),false));
ALTER TABLE "C8ResultRevision" ADD CONSTRAINT "C8_result_contract_ck" CHECK (coalesce((revision>0 AND "contractVersion"=1 AND "ruleVersion">0 AND length("ruleKey") BETWEEN 1 AND 120),false));
ALTER TABLE "C8ResultRevision" ADD CONSTRAINT "C8_result_hashes_ck" CHECK (coalesce((("identityHash" IS NULL OR "identityHash" ~ '^[0-9a-f]{64}$') AND ("intentHash" IS NULL OR "intentHash" ~ '^[0-9a-f]{64}$') AND ("modelManifestHash" IS NULL OR "modelManifestHash" ~ '^[0-9a-f]{64}$') AND ("policyContentHash" IS NULL OR "policyContentHash" ~ '^[0-9a-f]{64}$') AND ("inputHash" IS NULL OR "inputHash" ~ '^[0-9a-f]{64}$') AND ("leaseTokenHash" IS NULL OR "leaseTokenHash" ~ '^[0-9a-f]{64}$') AND ("snapshotHash" IS NULL OR "snapshotHash" ~ '^[0-9a-f]{64}$')),false));
ALTER TABLE "C8ResultRevision" ADD CONSTRAINT "C8_result_subject_ck" CHECK (coalesce(("subjectKind" IN ('client','appointment','staff','branch','tenant','cohort') AND length("subjectId") BETWEEN 1 AND 240),false));
ALTER TABLE "C8ResultRevision" ADD CONSTRAINT "C8_result_kind_ck" CHECK (coalesce((kind IN ('OBSERVED_VALUE','POLICY_SIGNAL','PREDICTION','SCENARIO','RANKING')),false));
ALTER TABLE "C8ResultRevision" ADD CONSTRAINT "C8_result_state_ck" CHECK (coalesce((state IN ('PENDING','PUBLISHED','UNAVAILABLE')),false));
ALTER TABLE "C8ResultRevision" ADD CONSTRAINT "C8_result_time_ck" CHECK (coalesce(("expiresAt">"admittedAt" AND "expiresAt"<="admittedAt"+interval '31536000 seconds' AND "periodFrom"<"periodTo" AND "periodTo"<=t0 AND t0<="admittedAt" AND ("horizonEnd" IS NULL OR "horizonEnd">t0) AND (kind<>'PREDICTION' OR "horizonEnd" IS NOT NULL)),false));
ALTER TABLE "C8ResultRevision" ADD CONSTRAINT "C8_result_lease_ck" CHECK (coalesce(("leaseGeneration">=0 AND (("leaseTokenHash" IS NULL AND "leaseExpiresAt" IS NULL) OR ("leaseTokenHash" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL AND "leaseExpiresAt"<="expiresAt" AND state='PENDING'))),false));
ALTER TABLE "C8ResultRevision" ADD CONSTRAINT "C8_result_publication_ck" CHECK (coalesce(((state='PENDING' AND "publishedAt" IS NULL AND "snapshotHash" IS NULL) OR (state<>'PENDING' AND "publishedAt" IS NOT NULL AND "publishedAt">="admittedAt" AND "snapshotHash" IS NOT NULL AND "reasonsJson" IS NOT NULL AND jsonb_typeof("reasonsJson")='array' AND "leaseTokenHash" IS NULL AND "leaseExpiresAt" IS NULL)),false));
ALTER TABLE "C8ResultRevision" ADD CONSTRAINT "C8_result_payload_ck" CHECK (coalesce((jsonb_typeof("scopeJson")='object' AND jsonb_typeof("inputSnapshotJson")='object' AND jsonb_typeof("evidenceRefsJson")='array' AND jsonb_array_length("evidenceRefsJson")<=5000
 AND (("modelVersionId" IS NULL AND "modelManifestHash" IS NULL) OR ("modelVersionId" IS NOT NULL AND "modelManifestHash" IS NOT NULL AND kind='PREDICTION'))
 AND ("rankingJson" IS NULL OR kind='RANKING') AND (currency IS NULL OR currency ~ '^[A-Z]{3}$')
 AND (basis NOT IN ('confirmed_cash','confirmed_refunds','confirmed_cash_net_linked_refunds','booked_value','provider_reported_gross') OR currency IS NOT NULL)
 AND ("valuesJson" IS NULL OR (jsonb_typeof("valuesJson")='object' AND jsonb_typeof("valuesJson"->'values')='array'))
 AND (state<>'PENDING' OR ("valuesJson" IS NULL AND "uncertaintyJson" IS NULL AND "reasonsJson" IS NULL AND "rankingJson" IS NULL))),false));
ALTER TABLE "C8ResultRevision" ADD CONSTRAINT "C8_result_eligibility_ck" CHECK (coalesce((completeness IN ('COMPLETE','PARTIAL','UNAVAILABLE','NOT_MEASURED') AND qualification IN ('VERIFIED','SOURCE_LABELLED','UNQUALIFIED')
 AND eligibility IN ('ELIGIBLE','INSUFFICIENT_DATA','UNSUPPORTED','INELIGIBLE')
 AND (state<>'UNAVAILABLE' OR ("valuesJson" IS NULL AND "rankingJson" IS NULL))
 AND (kind<>'PREDICTION' OR state<>'PUBLISHED' OR (eligibility='ELIGIBLE' AND completeness='COMPLETE' AND qualification='VERIFIED' AND "modelVersionId" IS NOT NULL))),false));
ALTER TABLE "C8EvaluationRevision" ADD CONSTRAINT "C8_eval_contract_ck" CHECK (coalesce((revision>0 AND "contractVersion"=1 AND jsonb_typeof("scopeJson")='object' AND jsonb_typeof("casesJson")='array' AND jsonb_array_length("casesJson")<=5000 AND jsonb_typeof("countsJson")='object'),false));
ALTER TABLE "C8EvaluationRevision" ADD CONSTRAINT "C8_eval_hashes_ck" CHECK (coalesce((("modelManifestHash" IS NULL OR "modelManifestHash" ~ '^[0-9a-f]{64}$') AND ("identityHash" IS NULL OR "identityHash" ~ '^[0-9a-f]{64}$') AND ("intentHash" IS NULL OR "intentHash" ~ '^[0-9a-f]{64}$') AND ("evaluationContractHash" IS NULL OR "evaluationContractHash" ~ '^[0-9a-f]{64}$') AND ("leaseTokenHash" IS NULL OR "leaseTokenHash" ~ '^[0-9a-f]{64}$') AND ("snapshotHash" IS NULL OR "snapshotHash" ~ '^[0-9a-f]{64}$') AND ("evidenceHash" IS NULL OR "evidenceHash" ~ '^[0-9a-f]{64}$')),false));
ALTER TABLE "C8EvaluationRevision" ADD CONSTRAINT "C8_eval_mode_ck" CHECK (coalesce((mode IN ('OFFLINE_BACKTEST','PROSPECTIVE','DRIFT')),false));
ALTER TABLE "C8EvaluationRevision" ADD CONSTRAINT "C8_eval_target_ck" CHECK (coalesce(("targetKey" IN ('attended_return','appointment_no_show','client_expected_value','business_revenue','staff_earnings_conditional','observed_booking_demand','scheduled_utilization','statistical_deviation')),false));
ALTER TABLE "C8EvaluationRevision" ADD CONSTRAINT "C8_eval_time_ck" CHECK (coalesce(("expiresAt">"admittedAt" AND "expiresAt"<="admittedAt"+interval '31536000 seconds' AND "t0From"<="t0To" AND "t0To"<="labelsAsOf" AND "labelsAsOf"<="admittedAt"),false));
ALTER TABLE "C8EvaluationRevision" ADD CONSTRAINT "C8_eval_state_lease_ck" CHECK (coalesce((state IN ('PENDING','PUBLISHED','UNAVAILABLE') AND "leaseGeneration">=0 AND (("leaseTokenHash" IS NULL AND "leaseExpiresAt" IS NULL) OR ("leaseTokenHash" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL AND "leaseExpiresAt"<="expiresAt" AND state='PENDING'))),false));
ALTER TABLE "C8EvaluationRevision" ADD CONSTRAINT "C8_eval_publication_ck" CHECK (coalesce(((state='PENDING' AND "publishedAt" IS NULL AND "snapshotHash" IS NULL) OR (state<>'PENDING' AND "publishedAt" IS NOT NULL AND "publishedAt">="admittedAt" AND "snapshotHash" IS NOT NULL AND "reasonsJson" IS NOT NULL AND jsonb_typeof("reasonsJson")='array' AND "leaseTokenHash" IS NULL AND "leaseExpiresAt" IS NULL)),false));
ALTER TABLE "C8EvaluationRevision" ADD CONSTRAINT "C8_eval_outcome_ck" CHECK (coalesce(((state='PENDING' AND outcome IS NULL AND "metricsJson" IS NULL AND "calibrationJson" IS NULL AND "driftJson" IS NULL AND "reasonsJson" IS NULL)
 OR (state<>'PENDING' AND outcome IN ('PASS','FAIL','INSUFFICIENT_DATA','NOT_YET_OBSERVED')
 AND (outcome<>'PASS' OR (state='PUBLISHED' AND "metricsJson" IS NOT NULL AND "calibrationJson" IS NOT NULL AND coalesce(("countsJson"->>'qualified')::int,0)>0))
 AND (outcome NOT IN ('INSUFFICIENT_DATA','NOT_YET_OBSERVED') OR (state='UNAVAILABLE' AND "metricsJson" IS NULL AND "calibrationJson" IS NULL)))),false));
ALTER TABLE "TenantBusinessConfigurationRevision" DROP CONSTRAINT "R11_config_contract_check";
ALTER TABLE "TenantBusinessConfigurationRevision" ADD CONSTRAINT "R11_config_contract_check" CHECK (
 "namespace" IN ('business_rules','client_capabilities','staff_ai_provider','c8_valuation') AND "contractVersion"=1 AND "revision">0
 AND "contentHash" ~ '^[a-f0-9]{64}$' AND (("revision"=1 AND "previousRevisionId" IS NULL) OR ("revision">1 AND "previousRevisionId" IS NOT NULL))
);

-- Non-owning, tenant-qualified references. Source owners remain mutable and retain their own cleanup.
CREATE FUNCTION "C8_validate_refs"(tenant text, refs jsonb, cutoff timestamptz) RETURNS boolean
LANGUAGE plpgsql SET timezone='UTC' AS $$
DECLARE ref jsonb; source_row jsonb; expected text; table_name text; newer boolean; source_client text;
BEGIN
 IF jsonb_typeof(refs)<>'array' OR jsonb_array_length(refs)>5000 THEN RETURN false; END IF;
 FOR ref IN SELECT value FROM jsonb_array_elements(refs) LOOP
  IF NOT coalesce(jsonb_typeof(ref)='object' AND
   (ref-ARRAY['owner','tenantId','id','revisionOrStateHash','observedAt','asOf','qualification','coverage','expiresAt'])='{}'::jsonb
   AND ref->>'tenantId'=tenant AND length(ref->>'id')>0 AND ref->>'revisionOrStateHash' ~ '^[a-f0-9]{64}$'
   AND (ref->>'observedAt')::timestamptz<=cutoff AND (ref->>'asOf')::timestamptz<=cutoff
   AND ref->>'qualification' IN ('VERIFIED','SOURCE_LABELLED','UNQUALIFIED')
   AND ref->>'coverage' IN ('COMPLETE','PARTIAL','UNAVAILABLE','NOT_MEASURED'),false) THEN RETURN false; END IF;
  table_name:=ref->>'owner';
  IF table_name NOT IN ('Client','Appointment','Staff','Branch','CrmClientLink','DomainEvent','MeasurementRevision','TenantBusinessConfigurationRevision','C8ResultRevision','C8ModelVersion','C8EvaluationRevision') THEN RETURN false; END IF;
  source_row:=NULL;
  EXECUTE format('SELECT to_jsonb(s) FROM %I s WHERE s.id::text=$1 AND s."tenantId"=$2 FOR SHARE',table_name)
   INTO source_row USING ref->>'id',tenant;
  IF source_row IS NULL THEN RETURN false; END IF;
  IF table_name='Client' AND source_row->>'mergedIntoClientId' IS NOT NULL THEN RETURN false; END IF;
  IF table_name IN ('MeasurementRevision','C8ResultRevision','C8EvaluationRevision') THEN
   IF source_row->>'state'<>'PUBLISHED' OR (source_row->>'expiresAt')::timestamptz<=clock_timestamp()
     OR (source_row->>'publishedAt')::timestamptz>cutoff THEN RETURN false; END IF;
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE "tenantId"=$1 AND "identityHash"=$2 AND revision>$3)',table_name)
    INTO newer USING tenant,source_row->>'identityHash',(source_row->>'revision')::int;
   IF newer THEN RETURN false; END IF;
   IF table_name='MeasurementRevision' AND source_row->>'appointmentId' IS NOT NULL THEN
    SELECT "mayaClientId" INTO source_client FROM "Appointment" WHERE id=source_row->>'appointmentId' AND "tenantId"=tenant FOR SHARE;
    IF NOT FOUND OR source_client IS DISTINCT FROM source_row->>'clientId' THEN RETURN false; END IF;
   END IF;
   IF table_name='C8ResultRevision' AND NOT "C8_validate_refs"(tenant,source_row->'evidenceRefsJson',(source_row->>'t0')::timestamptz) THEN RETURN false; END IF;
   expected:=source_row->>'snapshotHash';
   IF (ref->>'expiresAt')::timestamptz IS DISTINCT FROM (source_row->>'expiresAt')::timestamptz THEN RETURN false; END IF;
   IF table_name IN ('MeasurementRevision','C8ResultRevision') AND
    (source_row->>'qualification' IS DISTINCT FROM ref->>'qualification' OR source_row->>'completeness' IS DISTINCT FROM ref->>'coverage') THEN RETURN false; END IF;
  ELSIF table_name='TenantBusinessConfigurationRevision' THEN
   expected:=source_row->>'contentHash';
   IF source_row->>'namespace'<>'c8_valuation' OR source_row->>'encryptedContent' IS NULL
    OR (source_row->>'createdAt')::timestamptz>cutoff THEN RETURN false; END IF;
  ELSIF table_name='C8ModelVersion' THEN
   expected:=source_row->>'manifestHash';
   IF (source_row->>'admittedAt')::timestamptz>cutoff OR (source_row->>'expiresAt')::timestamptz<=clock_timestamp() THEN RETURN false; END IF;
  ELSE
   expected:=encode(sha256(convert_to(source_row::text,'UTF8')),'hex');
   IF table_name='DomainEvent' AND (source_row->>'receivedAt')::timestamptz>cutoff THEN RETURN false; END IF;
   IF source_row ? 'createdAt' AND (source_row->>'createdAt')::timestamptz>cutoff THEN RETURN false; END IF;
   IF source_row ? 'updatedAt' AND (source_row->>'updatedAt')::timestamptz>cutoff THEN RETURN false; END IF;
  END IF;
  IF expected IS DISTINCT FROM ref->>'revisionOrStateHash' THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN invalid_datetime_format OR invalid_text_representation OR datetime_field_overflow THEN RETURN false;
END $$;

CREATE FUNCTION "C8_retention_claim"(tenant text,tab text,item text,digest text,expiry timestamptz) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE class text; policy text;
BEGIN
 CASE tab
  WHEN 'C8ModelVersion' THEN class:='expire_c8_model_versions'; policy:='chapter8.model-retention';
  WHEN 'C8ResultRevision' THEN class:='expire_c8_result_revisions'; policy:='chapter8.result-retention';
  WHEN 'C8EvaluationRevision' THEN class:='expire_c8_evaluation_revisions'; policy:='chapter8.evaluation-retention';
  ELSE RETURN false;
 END CASE;
 RETURN "RC_payload_claim"(tenant,tab,item,digest,expiry,class,policy);
END $$;

CREATE FUNCTION "C8_model_guard"() RETURNS trigger LANGUAGE plpgsql SET timezone='UTC' AS $$
DECLARE row_json jsonb;
BEGIN
 IF TG_OP='TRUNCATE' THEN RAISE EXCEPTION 'C8 truncate forbidden' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN
  IF NOT "C8_retention_claim"(OLD."tenantId",TG_TABLE_NAME,OLD.id::text,OLD."intentHash",OLD."expiresAt") THEN
   RAISE EXCEPTION 'C8 exact AC6 claim required' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'C8 immutable model manifest' USING ERRCODE='23514'; END IF;
 PERFORM id FROM "Tenant" WHERE id=NEW."tenantId" AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'C8 inactive tenant' USING ERRCODE='23514'; END IF;
 IF NEW."admittedAt">clock_timestamp() OR NEW."admittedAt"<transaction_timestamp()-interval '1 minute' THEN
  RAISE EXCEPTION 'C8 admission server time required' USING ERRCODE='23514'; END IF;
 IF (NEW."methodJson"-ARRAY['version','methodKey','implementationDigest','hyperparameters','transforms','seed','numberFormat','intervalMethod'])<>'{}'::jsonb
 OR (NEW."parametersJson"-ARRAY['version','coefficientNames','coefficients','intercept','scaleParameters','calibrationParameters','residualSummary'])<>'{}'::jsonb
 OR (NEW."targetJson"-ARRAY['version','targetKey','eventDefinition','horizon','basis','currency','unit','labelMaturity','requiredCoverage','conditioning'])<>'{}'::jsonb
 OR (NEW."trainingEvidenceJson"-ARRAY['version','datasetHash','splitHash','sourceContractHashes','qualifiedCounts','excludedCounts','originFrom','originTo','labelsAsOf','knowledgeEvidenceHash'])<>'{}'::jsonb
 OR (NEW."scopeJson"-ARRAY['version','tenantId','branchIds','serviceScope','providerCapability','verticalDomain','cohortDefinitionHash'])<>'{}'::jsonb
 OR octet_length(NEW."parametersJson"::text)>262144 THEN
  RAISE EXCEPTION 'C8 model closed payload required' USING ERRCODE='23514'; END IF;
 IF NEW."methodJson"->>'methodKey' IS DISTINCT FROM 'unfitted_target' THEN RAISE EXCEPTION 'C8 no fitted method release in limited-data mode' USING ERRCODE='23514'; END IF;
 IF NEW."methodJson"->>'methodKey'='unfitted_target' AND
  (NEW."parametersJson" IS DISTINCT FROM '{"version":1,"coefficientNames":[],"coefficients":[]}'::jsonb
   OR NEW."trainingEvidenceJson"->'qualifiedCounts' IS DISTINCT FROM '{"cases":0}'::jsonb) THEN
  RAISE EXCEPTION 'C8 unfitted definition cannot claim parameters/training' USING ERRCODE='23514'; END IF;
 IF NEW."artifactHash" IS DISTINCT FROM encode(sha256(convert_to(NEW."parametersJson"::text,'UTF8')),'hex') THEN
  RAISE EXCEPTION 'C8 model artifact hash mismatch' USING ERRCODE='23514'; END IF;
 row_json:=to_jsonb(NEW)-ARRAY['id','manifestHash','intentHash','requestKeyHash','admittedAt','expiresAt'];
 IF NEW."manifestHash" IS DISTINCT FROM encode(sha256(convert_to(row_json::text,'UTF8')),'hex')
 OR NEW."intentHash" IS DISTINCT FROM NEW."manifestHash"
 OR NEW."requestKeyHash" IS DISTINCT FROM encode(sha256(convert_to(jsonb_build_array(NEW."tenantId",NEW."modelKey",NEW.version,NEW."releaseDigest")::text,'UTF8')),'hex') THEN
  RAISE EXCEPTION 'C8 model immutable identity mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION "C8_result_guard"() RETURNS trigger LANGUAGE plpgsql SET timezone='UTC' AS $$
DECLARE mutable text[]:=ARRAY['state','leaseGeneration','leaseTokenHash','leaseExpiresAt','publishedAt','snapshotHash','valuesJson','uncertaintyJson','reasonsJson','rankingJson'];
 normalized jsonb; expected text; head int; ref jsonb; source jsonb; policy "TenantBusinessConfigurationRevision"%ROWTYPE; model "C8ModelVersion"%ROWTYPE;
BEGIN
 IF TG_OP='TRUNCATE' THEN RAISE EXCEPTION 'C8 truncate forbidden' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN
  IF NOT "C8_retention_claim"(OLD."tenantId",TG_TABLE_NAME,OLD.id::text,coalesce(OLD."snapshotHash",OLD."intentHash"),OLD."expiresAt") THEN
   RAISE EXCEPTION 'C8 exact AC6 claim required' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'PENDING' OR NEW."leaseGeneration"<>0 OR NEW."leaseTokenHash" IS NOT NULL
   OR NEW."admittedAt">clock_timestamp() OR NEW."admittedAt"<transaction_timestamp()-interval '1 minute' THEN
   RAISE EXCEPTION 'C8 exact server admission required' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('c8/result/'||NEW."tenantId"||'/'||NEW."identityHash",0));
  SELECT coalesce(max(revision),0) INTO head FROM "C8ResultRevision" WHERE "tenantId"=NEW."tenantId" AND "identityHash"=NEW."identityHash";
  IF NEW.revision<>head+1 THEN RAISE EXCEPTION 'C8 result revision order' USING ERRCODE='23514'; END IF;
  normalized:=to_jsonb(NEW)-mutable-ARRAY['id','revision','identityHash','intentHash','admittedAt','expiresAt'];
  IF NEW."intentHash" IS DISTINCT FROM encode(sha256(convert_to(normalized::text,'UTF8')),'hex') THEN
   RAISE EXCEPTION 'C8 result intent mismatch' USING ERRCODE='23514'; END IF;
  expected:=encode(sha256(convert_to(jsonb_build_array(NEW."tenantId",NEW.kind,NEW."subjectKind",NEW."subjectId",NEW."ruleKey",NEW.basis,NEW.currency,NEW."periodFrom",NEW."periodTo",NEW.t0,NEW."horizonEnd",NEW."scopeJson")::text,'UTF8')),'hex');
  IF NEW."identityHash" IS DISTINCT FROM expected OR NEW."inputHash" IS DISTINCT FROM encode(sha256(convert_to(jsonb_build_array(NEW."inputSnapshotJson",NEW."evidenceRefsJson")::text,'UTF8')),'hex') THEN
   RAISE EXCEPTION 'C8 result identity/input mismatch' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.state<>'PENDING' OR (to_jsonb(NEW)-mutable) IS DISTINCT FROM (to_jsonb(OLD)-mutable) THEN
   RAISE EXCEPTION 'C8 immutable result/history' USING ERRCODE='23514'; END IF;
  IF NEW.state='PENDING' THEN
   IF OLD."leaseExpiresAt">clock_timestamp() OR NEW."leaseGeneration"<>OLD."leaseGeneration"+1
    OR NEW."leaseTokenHash" IS NULL OR NEW."leaseExpiresAt"<=clock_timestamp() THEN
    RAISE EXCEPTION 'C8 claim fenced' USING ERRCODE='23514'; END IF;
   RETURN NEW; -- Claiming is not a new effect; stale sources may close UNAVAILABLE.
  ELSE
   IF OLD."leaseTokenHash" IS NULL OR OLD."leaseExpiresAt"<=clock_timestamp()
    OR current_setting('maya.c8_fence',true) IS DISTINCT FROM OLD."leaseTokenHash"
    OR NEW."leaseGeneration"<>OLD."leaseGeneration" THEN RAISE EXCEPTION 'C8 publication fenced' USING ERRCODE='23514'; END IF;
   expected:=encode(sha256(convert_to(jsonb_build_array(NEW.state,NEW."valuesJson",NEW."uncertaintyJson",NEW."reasonsJson",NEW."rankingJson")::text,'UTF8')),'hex');
   IF NEW."snapshotHash" IS DISTINCT FROM expected THEN RAISE EXCEPTION 'C8 snapshot hash mismatch' USING ERRCODE='23514'; END IF;
   IF NEW."publishedAt">clock_timestamp() OR (NEW.state='PUBLISHED' AND NEW."expiresAt"<=clock_timestamp()) THEN
    RAISE EXCEPTION 'C8 publication outside retained lifetime' USING ERRCODE='23514'; END IF;
   IF NEW.state='UNAVAILABLE' THEN RETURN NEW; END IF;
  END IF;
 END IF;
 PERFORM id FROM "Tenant" WHERE id=NEW."tenantId" AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'C8 tenant revoked' USING ERRCODE='23514'; END IF;
 -- Same namespace serialization as A22; publication cannot skip a newer confirmed policy.
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW."tenantId"||':p5-wave1:setting:tenant-config:c8_valuation',0));
 SELECT * INTO policy FROM "TenantBusinessConfigurationRevision" WHERE "tenantId"=NEW."tenantId" AND namespace='c8_valuation' ORDER BY revision DESC LIMIT 1 FOR SHARE;
 IF policy.id IS DISTINCT FROM NEW."policyRevisionId" OR policy."contentHash" IS DISTINCT FROM NEW."policyContentHash" OR policy."encryptedContent" IS NULL
  OR policy."createdAt">NEW.t0 THEN RAISE EXCEPTION 'C8 policy source mismatch' USING ERRCODE='23514'; END IF;
 IF NEW."subjectKind"='tenant' THEN
  IF NEW."subjectId"<>NEW."tenantId" THEN RAISE EXCEPTION 'C8 tenant subject mismatch' USING ERRCODE='23514'; END IF;
 ELSIF NEW."subjectKind"='cohort' THEN
  IF NEW."subjectId" !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'C8 cohort digest required' USING ERRCODE='23514'; END IF;
 ELSE
  expected:=CASE NEW."subjectKind" WHEN 'client' THEN 'Client' WHEN 'appointment' THEN 'Appointment' WHEN 'staff' THEN 'Staff' WHEN 'branch' THEN 'Branch' END;
  EXECUTE format('SELECT to_jsonb(s) FROM %I s WHERE id::text=$1 AND "tenantId"=$2 FOR SHARE',expected) INTO source USING NEW."subjectId",NEW."tenantId";
  IF source IS NULL OR (NEW."subjectKind"='client' AND source->>'mergedIntoClientId' IS NOT NULL) THEN
   RAISE EXCEPTION 'C8 exact source subject required' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(NEW."evidenceRefsJson") r WHERE r->>'owner'=expected AND r->>'id'=NEW."subjectId") THEN
   RAISE EXCEPTION 'C8 subject evidence required' USING ERRCODE='23514'; END IF;
  IF NEW."subjectKind"='appointment' AND (source->>'mayaClientId' IS NULL OR NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(NEW."evidenceRefsJson") r WHERE r->>'owner'='Client' AND r->>'id'=source->>'mayaClientId')) THEN
    RAISE EXCEPTION 'C8 appointment exact Client evidence required' USING ERRCODE='23514'; END IF;
 END IF;
 IF NOT "C8_validate_refs"(NEW."tenantId",NEW."evidenceRefsJson",NEW.t0) THEN RAISE EXCEPTION 'C8 invalid/current source evidence' USING ERRCODE='23514'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW."evidenceRefsJson") r WHERE r->>'expiresAt' IS NOT NULL AND (r->>'expiresAt')::timestamptz<NEW."expiresAt") THEN
  RAISE EXCEPTION 'C8 cannot extend dependency retention' USING ERRCODE='23514'; END IF;
 IF (NEW."scopeJson"-ARRAY['version','capabilityKey','branchIds','serviceScope','staffScope','providerCapability','featureContractHash','targetKey','targetContractHash','cohortDefinitionHash'])<>'{}'::jsonb
 OR (NEW."inputSnapshotJson"-ARRAY['version','features','missingness','coverage','dependencies'])<>'{}'::jsonb
 OR NOT coalesce(jsonb_typeof(NEW."inputSnapshotJson"->'features')='array' AND jsonb_typeof(NEW."inputSnapshotJson"->'dependencies')='array',false) THEN
   RAISE EXCEPTION 'C8 closed input contract required' USING ERRCODE='23514'; END IF;
 -- A source snapshot for Client A cannot establish value for Client B.
 FOR ref IN SELECT value FROM jsonb_array_elements(NEW."evidenceRefsJson") WHERE value->>'owner'='MeasurementRevision' LOOP
  SELECT to_jsonb(r) INTO source FROM "MeasurementRevision" r WHERE id::text=ref->>'id' AND "tenantId"=NEW."tenantId";
  IF (NEW."subjectKind"='client' AND source->>'clientId' IS DISTINCT FROM NEW."subjectId")
   OR (NEW."subjectKind"='appointment' AND source->>'appointmentId' IS DISTINCT FROM NEW."subjectId")
   OR (NEW."subjectKind"='staff' AND source->>'staffId' IS DISTINCT FROM NEW."subjectId") THEN
   RAISE EXCEPTION 'C8 cross-subject measurement evidence' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF NEW."modelVersionId" IS NOT NULL THEN
  SELECT * INTO model FROM "C8ModelVersion" WHERE id=NEW."modelVersionId" AND "tenantId"=NEW."tenantId" FOR SHARE;
  IF model.id IS NULL OR model."manifestHash" IS DISTINCT FROM NEW."modelManifestHash" OR model."admittedAt">NEW.t0 OR model."expiresAt"<=clock_timestamp()
    OR model."targetKey" IS DISTINCT FROM NEW."scopeJson"->>'targetKey' THEN
   RAISE EXCEPTION 'C8 model scope/time mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.kind='PREDICTION' AND NEW.state='PUBLISHED' THEN
  -- No numeric model is released/qualified in the approved limited-data cutover.
  RAISE EXCEPTION 'C8 unqualified numeric prediction disabled' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION "C8_eval_guard"() RETURNS trigger LANGUAGE plpgsql SET timezone='UTC' AS $$
DECLARE mutable text[]:=ARRAY['state','leaseGeneration','leaseTokenHash','leaseExpiresAt','publishedAt','snapshotHash','metricsJson','calibrationJson','driftJson','outcome','reasonsJson'];
 model "C8ModelVersion"%ROWTYPE; head int; expected text; c jsonb; prediction "C8ResultRevision"%ROWTYPE; label jsonb; label_source "MeasurementRevision"%ROWTYPE;
 label_appointment "Appointment"%ROWTYPE; label_scalar text; metric_proven boolean; schedule_start timestamptz; schedule_end timestamptz;
BEGIN
 IF TG_OP='TRUNCATE' THEN RAISE EXCEPTION 'C8 truncate forbidden' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN
  IF NOT "C8_retention_claim"(OLD."tenantId",TG_TABLE_NAME,OLD.id::text,coalesce(OLD."snapshotHash",OLD."intentHash"),OLD."expiresAt") THEN
   RAISE EXCEPTION 'C8 exact AC6 claim required' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'PENDING' OR NEW."leaseGeneration"<>0 OR NEW."leaseTokenHash" IS NOT NULL OR NEW."admittedAt">clock_timestamp()
   OR NEW."admittedAt"<transaction_timestamp()-interval '1 minute' THEN RAISE EXCEPTION 'C8 evaluation server admission required' USING ERRCODE='23514'; END IF;
  expected:=encode(sha256(convert_to(jsonb_build_array(NEW."tenantId",NEW."modelVersionId",NEW.mode,NEW."targetKey",NEW."scopeJson",NEW."t0From",NEW."t0To")::text,'UTF8')),'hex');
  IF NEW."identityHash" IS DISTINCT FROM expected THEN RAISE EXCEPTION 'C8 evaluation series identity mismatch' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('c8/eval/'||NEW."tenantId"||'/'||NEW."identityHash",0));
  SELECT coalesce(max(revision),0) INTO head FROM "C8EvaluationRevision" WHERE "tenantId"=NEW."tenantId" AND "identityHash"=NEW."identityHash";
  IF NEW.revision<>head+1 THEN RAISE EXCEPTION 'C8 evaluation revision order' USING ERRCODE='23514'; END IF;
  expected:=encode(sha256(convert_to((to_jsonb(NEW)-mutable-ARRAY['id','revision','identityHash','intentHash','admittedAt','expiresAt'])::text,'UTF8')),'hex');
  IF NEW."intentHash" IS DISTINCT FROM expected OR NEW."evidenceHash" IS DISTINCT FROM encode(sha256(convert_to(jsonb_build_array(NEW."casesJson",NEW."countsJson")::text,'UTF8')),'hex') THEN
   RAISE EXCEPTION 'C8 evaluation intent/evidence mismatch' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.state<>'PENDING' OR (to_jsonb(NEW)-mutable) IS DISTINCT FROM (to_jsonb(OLD)-mutable) THEN
   RAISE EXCEPTION 'C8 immutable evaluation/history' USING ERRCODE='23514'; END IF;
  IF NEW.state='PENDING' THEN
   IF OLD."leaseExpiresAt">clock_timestamp() OR NEW."leaseGeneration"<>OLD."leaseGeneration"+1 OR NEW."leaseTokenHash" IS NULL OR NEW."leaseExpiresAt"<=clock_timestamp() THEN
    RAISE EXCEPTION 'C8 evaluation claim fenced' USING ERRCODE='23514'; END IF;
   RETURN NEW;
  ELSE
   IF OLD."leaseTokenHash" IS NULL OR OLD."leaseExpiresAt"<=clock_timestamp() OR current_setting('maya.c8_fence',true) IS DISTINCT FROM OLD."leaseTokenHash"
    OR NEW."leaseGeneration"<>OLD."leaseGeneration" THEN RAISE EXCEPTION 'C8 evaluation publication fenced' USING ERRCODE='23514'; END IF;
   expected:=encode(sha256(convert_to(jsonb_build_array(NEW.state,NEW.outcome,NEW."metricsJson",NEW."calibrationJson",NEW."driftJson",NEW."reasonsJson")::text,'UTF8')),'hex');
   IF NEW."snapshotHash" IS DISTINCT FROM expected THEN RAISE EXCEPTION 'C8 evaluation snapshot mismatch' USING ERRCODE='23514'; END IF;
   IF NEW."publishedAt">clock_timestamp() OR (NEW.state='PUBLISHED' AND NEW."expiresAt"<=clock_timestamp()) THEN
    RAISE EXCEPTION 'C8 publication outside retained lifetime' USING ERRCODE='23514'; END IF;
   IF NEW.state='UNAVAILABLE' THEN RETURN NEW; END IF;
  END IF;
 END IF;
 PERFORM id FROM "Tenant" WHERE id=NEW."tenantId" AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'C8 evaluation tenant revoked' USING ERRCODE='23514'; END IF;
 SELECT * INTO model FROM "C8ModelVersion" WHERE id=NEW."modelVersionId" AND "tenantId"=NEW."tenantId" FOR SHARE;
 IF model.id IS NULL OR model."manifestHash" IS DISTINCT FROM NEW."modelManifestHash" OR model."evaluationContractHash" IS DISTINCT FROM NEW."evaluationContractHash"
  OR model."targetKey" IS DISTINCT FROM NEW."targetKey" OR model."expiresAt"<=clock_timestamp() THEN
  RAISE EXCEPTION 'C8 evaluation exact model required' USING ERRCODE='23514'; END IF;
 IF NEW."scopeJson"->>'tenantId' IS DISTINCT FROM NEW."tenantId" OR NEW."expiresAt">model."expiresAt" OR NEW.mode<>'PROSPECTIVE'
  OR (NEW."scopeJson"-ARRAY['version','targetContractHash','tenantId','providerCapability','verticalDomain','cohortDefinitionHash','splitHash','baselineKey','featureContractHash'])<>'{}'::jsonb THEN
  RAISE EXCEPTION 'C8 qualified evaluation scope/retention required' USING ERRCODE='23514'; END IF;
 IF jsonb_array_length(NEW."casesJson")<>(SELECT count(DISTINCT value->>'caseKey') FROM jsonb_array_elements(NEW."casesJson"))
  OR NEW."countsJson" IS DISTINCT FROM jsonb_build_object('version',1,'total',jsonb_array_length(NEW."casesJson"),
   'qualified',(SELECT count(*) FROM jsonb_array_elements(NEW."casesJson") counted_case WHERE counted_case->>'labelState'='QUALIFIED'),
   'immature',(SELECT count(*) FROM jsonb_array_elements(NEW."casesJson") counted_case WHERE counted_case->>'labelState'='IMMATURE'),
   'unknown',(SELECT count(*) FROM jsonb_array_elements(NEW."casesJson") counted_case WHERE counted_case->>'labelState'='UNKNOWN'),
   'excluded',(SELECT count(*) FROM jsonb_array_elements(NEW."casesJson") counted_case WHERE counted_case->>'labelState'='EXCLUDED'),
   'independentClusters',(SELECT count(DISTINCT counted_case->>'clusterRef') FROM jsonb_array_elements(NEW."casesJson") counted_case)) THEN
   RAISE EXCEPTION 'C8 evaluation counted cases mismatch' USING ERRCODE='23514'; END IF;
 IF NEW.outcome='PASS' THEN RAISE EXCEPTION 'C8 unavailable calibration cannot PASS' USING ERRCODE='23514'; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(NEW."casesJson") LOOP
  IF NOT coalesce((c-ARRAY['caseKey','predictionRef','backtestInputRef','labelRefs','labelState','labelValue','exclusionCodes','clusterRef','dependencyDeadline'])='{}'::jsonb
   AND jsonb_typeof(c->'labelRefs')='array' AND "C8_validate_refs"(NEW."tenantId",c->'labelRefs',NEW."labelsAsOf"),false) THEN
    RAISE EXCEPTION 'C8 exact later label evidence required' USING ERRCODE='23514'; END IF;
  IF NEW.mode='PROSPECTIVE' THEN
   SELECT * INTO prediction FROM "C8ResultRevision" WHERE id::text=c->'predictionRef'->>'id' AND "tenantId"=NEW."tenantId" FOR SHARE;
   IF prediction.id IS NULL OR prediction.state='PENDING' OR prediction."snapshotHash" IS NULL OR prediction."snapshotHash" IS DISTINCT FROM c->'predictionRef'->>'hash' OR prediction.kind<>'PREDICTION'
    OR prediction."scopeJson"->>'targetKey' IS DISTINCT FROM NEW."targetKey" OR prediction.t0<NEW."t0From" OR prediction.t0>NEW."t0To"
    OR prediction."expiresAt"<=clock_timestamp() OR c->>'backtestInputRef' IS NOT NULL
    OR c->'predictionRef'->>'tenantId' IS DISTINCT FROM NEW."tenantId"
    OR (c->>'dependencyDeadline')::timestamptz>prediction."expiresAt" OR NEW."expiresAt">(c->>'dependencyDeadline')::timestamptz THEN
    RAISE EXCEPTION 'C8 prospective capture identity required' USING ERRCODE='23514'; END IF;
   IF c->>'labelState' NOT IN ('QUALIFIED','IMMATURE','UNKNOWN','EXCLUDED') OR c->>'labelState' IS NULL
    OR (c->>'labelState'<>'QUALIFIED' AND c->>'labelValue' IS NOT NULL)
    OR (c->>'labelState'='QUALIFIED' AND (c->>'labelValue' IS NULL OR jsonb_array_length(c->'labelRefs')=0)) THEN
     RAISE EXCEPTION 'C8 unknown label cannot become zero' USING ERRCODE='23514'; END IF;
   FOR label IN SELECT value FROM jsonb_array_elements(c->'labelRefs') LOOP
    SELECT * INTO label_source FROM "MeasurementRevision" WHERE id::text=label->>'id' AND "tenantId"=NEW."tenantId" FOR SHARE;
    IF label->>'owner'<>'MeasurementRevision' OR label_source.id IS NULL
     OR label_source."publishedAt"<=prediction.t0 OR label_source."asOf">NEW."labelsAsOf"
     OR (prediction."subjectKind"='client' AND label_source."clientId" IS DISTINCT FROM prediction."subjectId")
     OR (prediction."subjectKind"='appointment' AND label_source."appointmentId" IS DISTINCT FROM prediction."subjectId")
     OR (prediction."subjectKind"='staff' AND label_source."staffId" IS DISTINCT FROM prediction."subjectId")
     OR NEW."expiresAt">label_source."expiresAt"
     OR (c->>'labelState'='QUALIFIED' AND (label_source.qualification<>'VERIFIED' OR
       (label_source.completeness<>'COMPLETE' AND NEW."targetKey" NOT IN ('attended_return','appointment_no_show')))) THEN
     RAISE EXCEPTION 'C8 later label subject/knowledge/coverage mismatch' USING ERRCODE='23514'; END IF;
    -- Per-target label proof: an unrelated unknown cash metric must not erase
    -- proven attendance. PARTIAL is never itself evidence of a binary outcome.
    IF c->>'labelState'='QUALIFIED' AND NEW."targetKey" IN ('attended_return','appointment_no_show') THEN
     IF NEW."targetKey"='attended_return' AND c->>'labelValue'='0' THEN
      IF label_source.kind<>'client_history' OR label_source.completeness<>'COMPLETE'
       OR label_source."periodFrom">prediction.t0 OR label_source."periodTo"<=prediction."horizonEnd"
       OR label_source."asOf"<prediction."horizonEnd" OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(label_source."valuesJson"->'metrics') m
        WHERE m->>'key'='observed_attended_visits' AND m->>'value'='0' AND m->>'state'='COMPLETE') THEN
        RAISE EXCEPTION 'C8 non-return requires complete covered horizon' USING ERRCODE='23514'; END IF;
     ELSE
     SELECT * INTO label_appointment FROM "Appointment" WHERE id=label_source."appointmentId" AND "tenantId"=NEW."tenantId" FOR SHARE;
     IF label_appointment.id IS NULL OR label_appointment."mayaClientId" IS DISTINCT FROM label_source."clientId"
      OR label_appointment.status<>'confirmed' OR label_appointment."endAt">NEW."labelsAsOf" THEN
       RAISE EXCEPTION 'C8 binary label requires exact completed appointment' USING ERRCODE='23514'; END IF;
     IF NEW."targetKey"='attended_return' THEN
      IF c->>'labelValue'<>'1' OR label_appointment.attendance IS DISTINCT FROM 'arrived'
       OR label_appointment."startAt"<=prediction.t0 OR label_appointment."startAt">prediction."horizonEnd" THEN
        RAISE EXCEPTION 'C8 return label requires exact attended horizon event' USING ERRCODE='23514'; END IF;
      label_scalar:='arrived';
     ELSE
      SELECT (f->>'value')::timestamptz INTO schedule_start FROM jsonb_array_elements(prediction."inputSnapshotJson"->'features') f WHERE f->>'key'='scheduled_start_at';
      SELECT (f->>'value')::timestamptz INTO schedule_end FROM jsonb_array_elements(prediction."inputSnapshotJson"->'features') f WHERE f->>'key'='scheduled_end_at';
      IF schedule_start IS NULL OR schedule_end IS NULL OR label_appointment."startAt" IS DISTINCT FROM schedule_start
       OR label_appointment."endAt" IS DISTINCT FROM schedule_end OR schedule_end IS DISTINCT FROM prediction."horizonEnd"
       OR label_appointment.attendance NOT IN ('arrived','no_show') OR label_appointment.attendance IS NULL
       OR c->>'labelValue' IS DISTINCT FROM (CASE label_appointment.attendance WHEN 'no_show' THEN '1' WHEN 'arrived' THEN '0' END) THEN
        RAISE EXCEPTION 'C8 no-show label schedule/outcome mismatch' USING ERRCODE='23514'; END IF;
      label_scalar:=label_appointment.attendance;
     END IF;
     SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(label_source."valuesJson"->'metrics') m
      WHERE m->>'state'='COMPLETE' AND (
       (m->>'key'='attendance' AND m->>'value'=label_scalar) OR
       (m->>'key'='current_attended_outcome' AND m->>'value'=CASE label_scalar WHEN 'arrived' THEN 'true' WHEN 'no_show' THEN 'false' END))) INTO metric_proven;
     IF NOT metric_proven THEN RAISE EXCEPTION 'C8 binary label metric not proven' USING ERRCODE='23514'; END IF;
     END IF;
    END IF;
   END LOOP;
   IF c->>'labelState'='QUALIFIED' AND prediction."horizonEnd">NEW."labelsAsOf"
    AND NOT (NEW."targetKey"='attended_return' AND c->>'labelValue'='1') THEN
    RAISE EXCEPTION 'C8 immature label cannot be qualified' USING ERRCODE='23514'; END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER "C8_model_write_trg" BEFORE INSERT OR UPDATE OR DELETE ON "C8ModelVersion" FOR EACH ROW EXECUTE FUNCTION "C8_model_guard"();
CREATE TRIGGER "C8_result_write_trg" BEFORE INSERT OR UPDATE OR DELETE ON "C8ResultRevision" FOR EACH ROW EXECUTE FUNCTION "C8_result_guard"();
CREATE TRIGGER "C8_eval_write_trg" BEFORE INSERT OR UPDATE OR DELETE ON "C8EvaluationRevision" FOR EACH ROW EXECUTE FUNCTION "C8_eval_guard"();
-- The same three guards reject TRUNCATE; no alternate deletion route around AC6.
CREATE TRIGGER "C8_model_truncate_trg" BEFORE TRUNCATE ON "C8ModelVersion" FOR EACH STATEMENT EXECUTE FUNCTION "C8_model_guard"();
CREATE TRIGGER "C8_result_truncate_trg" BEFORE TRUNCATE ON "C8ResultRevision" FOR EACH STATEMENT EXECUTE FUNCTION "C8_result_guard"();
CREATE TRIGGER "C8_eval_truncate_trg" BEFORE TRUNCATE ON "C8EvaluationRevision" FOR EACH STATEMENT EXECUTE FUNCTION "C8_eval_guard"();
COMMIT;
