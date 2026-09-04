-- Approved D1 V1: exactly three additive fields; no historical approval backfill.
ALTER TABLE "AiOnboardingDraft"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "confirmationReceiptJson" JSONB,
  ADD COLUMN "confirmationMaterialEncrypted" TEXT;

CREATE FUNCTION "ai_confirmation_hash_v1"(value JSONB) RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT SET search_path = public, pg_temp AS $$
  SELECT encode(sha256(convert_to(value::TEXT, 'UTF8')), 'hex');
$$;

CREATE FUNCTION "ai_confirmation_receipt_valid_v1"(receipt JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = public, pg_temp AS $$
DECLARE child JSONB; dep JSONB; seen TEXT[] := ARRAY[]::TEXT[]; field TEXT;
BEGIN
  IF jsonb_typeof(receipt) IS DISTINCT FROM 'object'
    OR NOT receipt ?& ARRAY['contract','policyVersion','draftRevision','draftSnapshotHash',
      'trialActivationId','expectedTenantId','ownerUserId','authorityHash','intentHash',
      'manifestHash','confirmationId','approvedAt','children']
    OR receipt - ARRAY['contract','policyVersion','draftRevision','draftSnapshotHash',
      'trialActivationId','expectedTenantId','ownerUserId','authorityHash','intentHash',
      'manifestHash','confirmationId','approvedAt','children'] <> '{}'::JSONB
    OR receipt->>'contract' IS DISTINCT FROM 'package5.ai-draft-confirmation/1'
    OR receipt->'policyVersion' IS DISTINCT FROM '1'::JSONB
    OR jsonb_typeof(receipt->'draftRevision') IS DISTINCT FROM 'number'
    OR NOT (receipt->>'draftRevision') ~ '^[0-9]+$'
    OR jsonb_typeof(receipt->'children') IS DISTINCT FROM 'array'
    OR octet_length(receipt::TEXT) > 1048576 THEN RETURN FALSE; END IF;
  -- Existing bounds: two children/provider (100), 30 services, 30 members,
  -- one owner, eight A26 and four A17 classes. No unbounded bulk plan.
  IF jsonb_array_length(receipt->'children') > 273 THEN RETURN FALSE; END IF;
  FOREACH field IN ARRAY ARRAY['draftSnapshotHash','authorityHash','intentHash','manifestHash','confirmationId'] LOOP
    IF jsonb_typeof(receipt->field) IS DISTINCT FROM 'string'
      OR NOT (receipt->>field) ~ '^[0-9a-f]{64}$' THEN RETURN FALSE; END IF;
  END LOOP;
  FOREACH field IN ARRAY ARRAY['trialActivationId','expectedTenantId','ownerUserId'] LOOP
    IF jsonb_typeof(receipt->field) IS DISTINCT FROM 'string'
      OR NOT (receipt->>field) ~ '^[A-Za-z0-9._:-]{1,240}$' THEN RETURN FALSE; END IF;
  END LOOP;
  IF jsonb_typeof(receipt->'approvedAt') IS DISTINCT FROM 'string'
    OR NOT (receipt->>'approvedAt') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    OR receipt->>'manifestHash' <> ai_confirmation_hash_v1(receipt->'children') THEN RETURN FALSE; END IF;
  FOR child IN SELECT value FROM jsonb_array_elements(receipt->'children') LOOP
    IF jsonb_typeof(child) IS DISTINCT FROM 'object'
      OR NOT child ?& ARRAY['key','family','actionClass','sourceIntentRef','targetKind','targetRef','inputHash','dependsOn']
      OR child - ARRAY['key','family','actionClass','sourceIntentRef','targetKind','targetRef','inputHash','dependsOn'] <> '{}'::JSONB
      OR jsonb_typeof(child->'key') IS DISTINCT FROM 'string'
      OR NOT (child->>'key') ~ '^[A-Za-z0-9._:-]{1,120}$'
      OR child->>'key' = ANY(seen)
      OR child->>'sourceIntentRef' IS DISTINCT FROM ('aic1:' || (receipt->>'confirmationId') || ':' || (child->>'key'))
      OR jsonb_typeof(child->'inputHash') IS DISTINCT FROM 'string'
      OR NOT (child->>'inputHash') ~ '^[0-9a-f]{64}$'
      OR (child->'targetRef' <> 'null'::JSONB AND
        (jsonb_typeof(child->'targetRef') IS DISTINCT FROM 'string' OR NOT (child->>'targetRef') ~ '^[A-Za-z0-9._:-]{1,240}$'))
      OR jsonb_typeof(child->'dependsOn') IS DISTINCT FROM 'array'
      THEN RETURN FALSE; END IF;
    IF NOT EXISTS (SELECT 1 FROM (VALUES
      ('A16','configure_crm_staff_access','staff_access'),('A16','claim_crm_team_owner','staff_access'),
      ('A17','install_or_replace_crm_credentials','crm_integration'),('A17','activate_crm_integration','crm_integration'),
      ('A17','confirm_crm_import','crm_integration'),('A17','disconnect_crm_integration','crm_integration'),
      ('A26','update_tenant_configuration','tenant'),('A26','update_tenant_branding','tenant_branding'),
      ('A26','upload_tenant_logo','tenant_branding'),('A26','create_tenant_user','tenant_user'),
      ('A26','create_internal_provider_user','internal_provider_user'),('A26','suspend_tenant','tenant'),
      ('A26','reactivate_tenant','tenant'),('A26','create_tenant_branch','branch'),
      ('A28','create_internal_service','internal_service'),('A28','update_internal_service','internal_service'),
      ('A28','archive_internal_service','internal_service'),('A28','create_internal_provider','internal_provider'),
      ('A28','update_internal_provider','internal_provider'),('A28','replace_weekly_availability','internal_weekly_availability'),
      ('A28','create_time_off','internal_time_off'),('A28','delete_time_off','internal_time_off'),
      ('A28','upload_provider_avatar','internal_provider_avatar')
    ) AS allowed(family, action, target)
    WHERE allowed.family = child->>'family' AND allowed.action = child->>'actionClass'
      AND allowed.target = child->>'targetKind') THEN RETURN FALSE; END IF;
    FOR dep IN SELECT value FROM jsonb_array_elements(child->'dependsOn') LOOP
      IF jsonb_typeof(dep) IS DISTINCT FROM 'string' OR NOT (dep #>> '{}') = ANY(seen) THEN RETURN FALSE; END IF;
    END LOOP;
    seen := array_append(seen, child->>'key');
  END LOOP;
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN RETURN FALSE;
END;
$$;

ALTER TABLE "AiOnboardingDraft" ADD CONSTRAINT "AiOnboardingDraft_confirmation_v1_check" CHECK (
  "revision" >= 0 AND (
    ("confirmationReceiptJson" IS NULL AND "confirmationMaterialEncrypted" IS NULL) OR
    ("confirmationReceiptJson" IS NOT NULL AND "confirmationMaterialEncrypted" IS NOT NULL
      AND "confirmationMaterialEncrypted" ~ '^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$'
      AND octet_length("confirmationMaterialEncrypted") <= 1048576
      AND ai_confirmation_receipt_valid_v1("confirmationReceiptJson") IS TRUE)
  )
);

CREATE FUNCTION "guard_ai_confirmation_v1"() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE activation "TrialActivation"%ROWTYPE; token_digest TEXT; receipt JSONB;
  server_now TIMESTAMP(3) := (clock_timestamp() AT TIME ZONE 'UTC')::TIMESTAMP(3);
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."confirmationReceiptJson" IS NOT NULL THEN
      RAISE EXCEPTION 'Confirmed draft evidence cannot be deleted' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."confirmationReceiptJson" IS NOT NULL OR NEW."confirmationMaterialEncrypted" IS NOT NULL OR NEW."revision" <> 0 THEN
      RAISE EXCEPTION 'Draft must start without historical confirmation' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."confirmationReceiptJson" IS NOT NULL THEN
    IF (to_jsonb(NEW) - ARRAY['status','confirmedTenantId','updatedAt']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','confirmedTenantId','updatedAt'])
       OR NEW."status" NOT IN ('confirming','confirmed')
       OR (OLD."status" = 'confirmed' AND NEW."status" <> 'confirmed')
       OR (OLD."confirmedTenantId" IS NOT NULL AND NEW."confirmedTenantId" IS DISTINCT FROM OLD."confirmedTenantId") THEN
      RAISE EXCEPTION 'Confirmation envelope is immutable; reset forbidden' USING ERRCODE='23514';
    END IF;
  ELSIF NEW."confirmationReceiptJson" IS NOT NULL THEN
    receipt := NEW."confirmationReceiptJson";
    SELECT * INTO activation FROM "TrialActivation" WHERE "id" = NEW."trialActivationId" FOR UPDATE;
    IF NOT FOUND OR activation."status" <> 'pending' OR activation."tenantId" IS NOT NULL
      OR activation."expiresAt" <= server_now OR OLD."expiresAt" <= server_now
      OR OLD."status" <> 'draft' OR NEW."status" <> 'confirming'
      OR NEW."trialActivationId" IS DISTINCT FROM OLD."trialActivationId"
      OR NEW."draftTokenHash" IS DISTINCT FROM OLD."draftTokenHash"
      OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
      OR NEW."revision" <> OLD."revision"
      OR (receipt->>'draftRevision')::INTEGER <> OLD."revision"
      OR receipt->>'trialActivationId' IS DISTINCT FROM activation."id"
      OR receipt->>'draftSnapshotHash' IS DISTINCT FROM ai_confirmation_hash_v1(NEW."blueprintJson") THEN
      RAISE EXCEPTION 'Exact current draft and pending activation required' USING ERRCODE='23514';
    END IF;
    token_digest := encode(sha256(convert_to('package5.wave2.trial-bootstrap:' || activation."activationTokenHash", 'UTF8')), 'hex');
    IF receipt->>'expectedTenantId' IS DISTINCT FROM ('p5t_' || left(token_digest,28))
      OR receipt->>'ownerUserId' IS DISTINCT FROM ('p5o_' || left(token_digest,28))
      OR receipt->>'confirmationId' IS DISTINCT FROM ai_confirmation_hash_v1(jsonb_build_array(
        'package5.ai-draft-confirmation/1', NEW."id", OLD."revision", receipt->>'expectedTenantId',
        receipt->>'authorityHash', receipt->>'intentHash')) THEN
      RAISE EXCEPTION 'Reserved confirmation identity mismatch' USING ERRCODE='23514';
    END IF;
    NEW."confirmationReceiptJson" := jsonb_set(receipt, '{approvedAt}',
      to_jsonb(to_char(server_now, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  ELSE
    -- Old deployed writers remain compatible until runtime release; every edit
    -- advances the server revision. New callers additionally use revision CAS.
    IF NEW."revision" NOT IN (OLD."revision", OLD."revision" + 1) THEN
      RAISE EXCEPTION 'Draft revision cannot be rewritten' USING ERRCODE='23514';
    END IF;
    NEW."revision" := OLD."revision" + 1;
  END IF;
  IF NEW."confirmationReceiptJson" IS NOT NULL THEN
    IF NEW."status" = 'confirming' AND NEW."confirmedTenantId" IS NOT NULL THEN
      RAISE EXCEPTION 'Partial confirmation cannot claim completion' USING ERRCODE='23514';
    END IF;
    IF NEW."status" = 'confirmed' AND NOT EXISTS (
      SELECT 1 FROM "TrialActivation" a JOIN "Membership" m ON m."tenantId"=a."tenantId"
        AND m."userId"=NEW."confirmationReceiptJson"->>'ownerUserId'
      WHERE a."id"=NEW."trialActivationId" AND a."status"='completed'
        AND a."tenantId"=NEW."confirmedTenantId"
        AND a."tenantId"=NEW."confirmationReceiptJson"->>'expectedTenantId'
    ) THEN RAISE EXCEPTION 'Confirmation requires exact durable bootstrap result' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "AiOnboardingDraft_confirmation_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "AiOnboardingDraft"
FOR EACH ROW EXECUTE FUNCTION "guard_ai_confirmation_v1"();

CREATE FUNCTION "guard_ai_confirmation_activation_v1"() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE receipt JSONB;
BEGIN
  SELECT "confirmationReceiptJson" INTO receipt FROM "AiOnboardingDraft"
    WHERE "trialActivationId"=OLD."id" AND "confirmationReceiptJson" IS NOT NULL;
  IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Receipt activation cannot be deleted' USING ERRCODE='23514';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status','tenantId','completedAt','updatedAt']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','tenantId','completedAt','updatedAt'])
    OR NEW."status" NOT IN ('pending','completed')
    OR (OLD."status"='completed' AND (NEW."status"<>'completed'
      OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."completedAt" IS DISTINCT FROM OLD."completedAt"))
    OR (NEW."status"='pending' AND (NEW."tenantId" IS NOT NULL OR NEW."completedAt" IS NOT NULL))
    OR (NEW."status"='completed' AND (NEW."tenantId" IS DISTINCT FROM receipt->>'expectedTenantId' OR NEW."completedAt" IS NULL)) THEN
    RAISE EXCEPTION 'Receipt activation cannot be reset or rebound' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TrialActivation_ai_confirmation_guard"
BEFORE UPDATE OR DELETE ON "TrialActivation"
FOR EACH ROW EXECUTE FUNCTION "guard_ai_confirmation_activation_v1"();

-- Match the existing Wave 2/3/4 canonical source identities, without another ledger.
CREATE FUNCTION "ai_confirmation_child_source_v1"(child JSONB, tenant TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = public, pg_temp AS $$
DECLARE operation TEXT := CASE child->>'actionClass'
  WHEN 'configure_crm_staff_access' THEN 'configure_staff_access'
  WHEN 'claim_crm_team_owner' THEN 'claim_team_owner'
  WHEN 'create_internal_provider_user' THEN 'create_provider_user'
  WHEN 'install_or_replace_crm_credentials' THEN 'install_crm_credentials'
  ELSE child->>'actionClass' END;
  material TEXT;
BEGIN
  IF child->>'family' = 'A28' THEN
    material := '{"operation":' || to_json(operation)::TEXT || ',"sourceIntentRef":' || to_json(child->>'sourceIntentRef')::TEXT || ',"tenantId":' || to_json(tenant)::TEXT || '}';
    RETURN 'p5w4:' || encode(sha256(convert_to(material,'UTF8')),'hex');
  END IF;
  material := '{"sourceIntentRef":' || to_json(child->>'sourceIntentRef')::TEXT || '}';
  RETURN CASE WHEN child->>'family'='A17' THEN 'p5w3:' ELSE 'p5w2:' END || encode(sha256(convert_to(material,'UTF8')),'hex');
END;
$$;
CREATE FUNCTION "check_ai_confirmation_children_v1"() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE child JSONB; matches INTEGER;
BEGIN
  IF NEW."confirmationReceiptJson" IS NULL OR NEW."status" <> 'confirmed' THEN RETURN NULL; END IF;
  FOR child IN SELECT value FROM jsonb_array_elements(NEW."confirmationReceiptJson"->'children') LOOP
    SELECT count(*) INTO matches FROM "ActionExecution" e WHERE e."tenantId"=NEW."confirmedTenantId"
      AND e."sourceRef"=ai_confirmation_child_source_v1(child,NEW."confirmedTenantId")
      AND e."actionClass"=child->>'actionClass' AND e."targetKind"=child->>'targetKind'
      AND (child->'targetRef'='null'::JSONB OR e."targetRef"=child->>'targetRef')
      AND e."actorUserId"=NEW."confirmationReceiptJson"->>'ownerUserId'
      AND e."capability" LIKE 'package5.%.execute.v1' AND e."state"='SUCCEEDED'
      AND EXISTS (SELECT 1 FROM "ActionTargetMutation" m WHERE m."tenantId"=e."tenantId" AND m."actionExecutionId"=e."id");
    IF matches <> 1 THEN RAISE EXCEPTION 'Confirmation requires every exact canonical child outcome' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "AiOnboardingDraft_children_guard"
AFTER INSERT OR UPDATE ON "AiOnboardingDraft" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "check_ai_confirmation_children_v1"();
