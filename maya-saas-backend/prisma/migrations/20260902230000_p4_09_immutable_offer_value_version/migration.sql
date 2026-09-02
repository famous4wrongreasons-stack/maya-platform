-- Cycle 06 Blocking Package 4 P4-09 immutable offer-value foundation.
-- Existing catalog/referral rows remain historical with NULL current-version
-- pointers. No offer version, referral policy version, or issued value is
-- backfilled by this additive migration.

ALTER TABLE "TenantCatalogItem"
  ADD COLUMN "canonicalTemplateKey" TEXT,
  ADD COLUMN "currentValueVersionId" TEXT;

CREATE UNIQUE INDEX "TenantCatalogItem_id_tenantId_key"
  ON "TenantCatalogItem"("id", "tenantId");

CREATE UNIQUE INDEX "TenantCatalogItem_currentValueVersionId_tenantId_key"
  ON "TenantCatalogItem"("currentValueVersionId", "tenantId");

CREATE UNIQUE INDEX "TenantCatalogItem_tenantId_kind_canonicalTemplateKey_key"
  ON "TenantCatalogItem"("tenantId", "kind", "canonicalTemplateKey");

CREATE TABLE "TenantCatalogItemValueVersion" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "actionExecutionId" TEXT NOT NULL,
  "previousVersionId" TEXT,
  "version" INTEGER NOT NULL,
  "templateKey" TEXT NOT NULL,
  "offerKind" TEXT NOT NULL,
  "priceKopecks" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "availabilityState" TEXT NOT NULL,
  "valueSnapshotHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TenantCatalogItemValueVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantCatalogItemValueVersion_shape_check" CHECK (
    "version" >= 1
    AND "priceKopecks" > 0
    AND "currency" = 'RUB'
    AND "availabilityState" IN ('ACTIVE', 'INACTIVE', 'RETIRED')
    AND btrim("valueSnapshotHash") <> ''
    AND (
      (
        "offerKind" = 'membership'
        AND "priceKopecks" <= 600000
        AND "templateKey" IN (
          'haircut.senior',
          'haircut.top',
          'complex.senior',
          'complex.top',
          'beard.senior',
          'beard.top'
        )
      )
      OR (
        "offerKind" = 'certificate'
        AND "priceKopecks" <= 500000
        AND "templateKey" IN (
          'gift-certificate.2000',
          'gift-certificate.3000',
          'gift-certificate.5000'
        )
      )
    )
  )
);

CREATE UNIQUE INDEX "TenantCatalogItemValueVersion_id_tenantId_key"
  ON "TenantCatalogItemValueVersion"("id", "tenantId");

CREATE UNIQUE INDEX "TenantCatalogItemValueVersion_offerId_tenantId_version_key"
  ON "TenantCatalogItemValueVersion"("offerId", "tenantId", "version");

CREATE UNIQUE INDEX "TenantCatalogItemValueVersion_actionExecutionId_tenantId_key"
  ON "TenantCatalogItemValueVersion"("actionExecutionId", "tenantId");

CREATE UNIQUE INDEX "TenantCatalogItemValueVersion_previousVersionId_tenantId_key"
  ON "TenantCatalogItemValueVersion"("previousVersionId", "tenantId");

CREATE INDEX "TenantCatalogItemValueVersion_lookup_idx"
  ON "TenantCatalogItemValueVersion"(
    "tenantId",
    "templateKey",
    "availabilityState"
  );

ALTER TABLE "TenantCatalogItemValueVersion"
  ADD CONSTRAINT "TenantCatalogItemValueVersion_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TenantCatalogItemValueVersion_offerId_tenantId_fkey"
  FOREIGN KEY ("offerId", "tenantId")
  REFERENCES "TenantCatalogItem"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "TenantCatalogItemValueVersion_actionExecutionId_tenantId_fkey"
  FOREIGN KEY ("actionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "TenantCatalogItemValueVersion_previousVersionId_tenantId_fkey"
  FOREIGN KEY ("previousVersionId", "tenantId")
  REFERENCES "TenantCatalogItemValueVersion"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "TenantCatalogItem"
  ADD CONSTRAINT "TenantCatalogItem_currentValueVersionId_tenantId_fkey"
  FOREIGN KEY ("currentValueVersionId", "tenantId")
  REFERENCES "TenantCatalogItemValueVersion"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ReferralProgram"
  ADD COLUMN "currentValueVersionId" TEXT;

CREATE UNIQUE INDEX "ReferralProgram_id_tenantId_key"
  ON "ReferralProgram"("id", "tenantId");

CREATE UNIQUE INDEX "ReferralProgram_currentValueVersionId_tenantId_key"
  ON "ReferralProgram"("currentValueVersionId", "tenantId");

CREATE TABLE "ReferralProgramValueVersion" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "actionExecutionId" TEXT NOT NULL,
  "previousVersionId" TEXT,
  "version" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "inviterRewardKopecks" INTEGER,
  "inviteeRewardKopecks" INTEGER,
  "inviterRewardPercentBasisPoints" INTEGER,
  "inviteeRewardPercentBasisPoints" INTEGER,
  "inviterRewardLiabilityCapKopecks" INTEGER,
  "inviteeRewardLiabilityCapKopecks" INTEGER,
  "currency" TEXT NOT NULL,
  "valueSnapshotHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReferralProgramValueVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReferralProgramValueVersion_inviter_contract_check" CHECK (
    (
      "inviterRewardKopecks" IS NULL
      AND "inviterRewardPercentBasisPoints" IS NULL
      AND "inviterRewardLiabilityCapKopecks" IS NULL
    )
    OR (
      "inviterRewardKopecks" BETWEEN 1 AND 50000
      AND "inviterRewardPercentBasisPoints" IS NULL
      AND "inviterRewardLiabilityCapKopecks" IS NULL
    )
    OR (
      "inviterRewardKopecks" IS NULL
      AND "inviterRewardPercentBasisPoints" BETWEEN 1 AND 10000
      AND "inviterRewardLiabilityCapKopecks" BETWEEN 1 AND 50000
    )
  ),
  CONSTRAINT "ReferralProgramValueVersion_invitee_contract_check" CHECK (
    (
      "inviteeRewardKopecks" IS NULL
      AND "inviteeRewardPercentBasisPoints" IS NULL
      AND "inviteeRewardLiabilityCapKopecks" IS NULL
    )
    OR (
      "inviteeRewardKopecks" BETWEEN 1 AND 50000
      AND "inviteeRewardPercentBasisPoints" IS NULL
      AND "inviteeRewardLiabilityCapKopecks" IS NULL
    )
    OR (
      "inviteeRewardKopecks" IS NULL
      AND "inviteeRewardPercentBasisPoints" BETWEEN 1 AND 10000
      AND "inviteeRewardLiabilityCapKopecks" BETWEEN 1 AND 50000
    )
  ),
  CONSTRAINT "ReferralProgramValueVersion_aggregate_contract_check" CHECK (
    "version" >= 1
    AND "currency" = 'RUB'
    AND btrim("valueSnapshotHash") <> ''
    AND (
      COALESCE(
        "inviterRewardKopecks",
        "inviterRewardLiabilityCapKopecks",
        0
      )
      + COALESCE(
        "inviteeRewardKopecks",
        "inviteeRewardLiabilityCapKopecks",
        0
      )
    ) <= 100000
  )
);

CREATE UNIQUE INDEX "ReferralProgramValueVersion_id_tenantId_key"
  ON "ReferralProgramValueVersion"("id", "tenantId");

CREATE UNIQUE INDEX "ReferralProgramValueVersion_programId_tenantId_version_key"
  ON "ReferralProgramValueVersion"("programId", "tenantId", "version");

CREATE UNIQUE INDEX "ReferralProgramValueVersion_actionExecutionId_tenantId_key"
  ON "ReferralProgramValueVersion"("actionExecutionId", "tenantId");

CREATE UNIQUE INDEX "ReferralProgramValueVersion_previousVersionId_tenantId_key"
  ON "ReferralProgramValueVersion"("previousVersionId", "tenantId");

CREATE INDEX "ReferralProgramValueVersion_tenantId_programId_version_idx"
  ON "ReferralProgramValueVersion"("tenantId", "programId", "version");

ALTER TABLE "ReferralProgramValueVersion"
  ADD CONSTRAINT "ReferralProgramValueVersion_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ReferralProgramValueVersion_programId_tenantId_fkey"
  FOREIGN KEY ("programId", "tenantId")
  REFERENCES "ReferralProgram"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "ReferralProgramValueVersion_actionExecutionId_tenantId_fkey"
  FOREIGN KEY ("actionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "ReferralProgramValueVersion_previousVersionId_tenantId_fkey"
  FOREIGN KEY ("previousVersionId", "tenantId")
  REFERENCES "ReferralProgramValueVersion"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ReferralProgram"
  ADD CONSTRAINT "ReferralProgram_currentValueVersionId_tenantId_fkey"
  FOREIGN KEY ("currentValueVersionId", "tenantId")
  REFERENCES "ReferralProgramValueVersion"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "p409_require_owner_approved_execution"(
  checked_tenant_id TEXT,
  checked_execution_id TEXT,
  checked_action_class TEXT,
  checked_target_kind TEXT,
  checked_target_ref TEXT
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
    OR execution_row."actionClass" IS DISTINCT FROM checked_action_class
    OR execution_row."targetKind" IS DISTINCT FROM checked_target_kind
    OR execution_row."targetRef" IS DISTINCT FROM checked_target_ref
    OR execution_row."policyDecision"::TEXT <> 'ALLOW'
    OR execution_row."approvalRequirement" <> 'REQUIRED'
    OR execution_row."approvalDecision"::TEXT <> 'APPROVED'
    OR execution_row."approvalDecidedByUserId" IS NULL
    OR execution_row."approvalDecidedAt" IS NULL
    OR execution_row."approvalInputHash" IS NULL
    OR execution_row."approvalInputHash" IS DISTINCT FROM
      execution_row."normalizedInputHash"
    OR execution_row."approvalBindingHash" IS NULL
    OR btrim(execution_row."approvalBindingHash") = ''
    OR execution_row."dryRun"
    OR execution_row."state"::TEXT NOT IN ('EXECUTING', 'SUCCEEDED')
  THEN
    RAISE EXCEPTION 'P4-09 value version requires its exact owner-approved canonical ActionExecution'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "Membership"
    WHERE "tenantId" = checked_tenant_id
      AND "userId" = execution_row."approvalDecidedByUserId"
      AND "status"::TEXT = 'active'
      AND "role"::TEXT IN ('tenant_owner', 'business_owner')
  )
  THEN
    RAISE EXCEPTION 'P4-09 value version requires an active same-tenant owner approver'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION "guard_tenant_catalog_item_value_version_insert"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  offer_row "TenantCatalogItem"%ROWTYPE;
  previous_row "TenantCatalogItemValueVersion"%ROWTYPE;
  expected_action_class TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW."tenantId" || ':p4-09:offer:' || NEW."offerId", 0)
  );

  SELECT *
  INTO offer_row
  FROM "TenantCatalogItem"
  WHERE "id" = NEW."offerId"
    AND "tenantId" = NEW."tenantId"
  FOR UPDATE;

  IF NOT FOUND
    OR offer_row."kind" NOT IN ('membership', 'certificate')
    OR offer_row."kind" IS DISTINCT FROM NEW."offerKind"
    OR offer_row."canonicalTemplateKey" IS NULL
    OR offer_row."canonicalTemplateKey" IS DISTINCT FROM NEW."templateKey"
  THEN
    RAISE EXCEPTION 'Offer value version must bind the exact tenant offer identity, kind, and template'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."previousVersionId" IS NULL THEN
    IF NEW."version" <> 1
      OR offer_row."currentValueVersionId" IS NOT NULL
      OR NEW."availabilityState" = 'RETIRED'
    THEN
      RAISE EXCEPTION 'Initial offer value version must be non-retired generation 1'
        USING ERRCODE = '23514';
    END IF;
    expected_action_class := CASE NEW."offerKind"
      WHEN 'membership' THEN 'create_customer_membership_offer'
      ELSE 'create_gift_certificate_offer'
    END;
  ELSE
    SELECT *
    INTO previous_row
    FROM "TenantCatalogItemValueVersion"
    WHERE "id" = NEW."previousVersionId"
      AND "tenantId" = NEW."tenantId"
    FOR KEY SHARE;

    IF NOT FOUND
      OR previous_row."offerId" IS DISTINCT FROM NEW."offerId"
      OR previous_row."offerKind" IS DISTINCT FROM NEW."offerKind"
      OR previous_row."templateKey" IS DISTINCT FROM NEW."templateKey"
      OR previous_row."version" + 1 IS DISTINCT FROM NEW."version"
      OR previous_row."availabilityState" = 'RETIRED'
      OR offer_row."currentValueVersionId" IS DISTINCT FROM
        NEW."previousVersionId"
    THEN
      RAISE EXCEPTION 'Offer value version predecessor is stale, non-contiguous, or mismatched'
        USING ERRCODE = '23514';
    END IF;

    expected_action_class := CASE
      WHEN NEW."offerKind" = 'membership'
        AND NEW."availabilityState" = 'RETIRED'
        THEN 'delete_customer_membership_offer'
      WHEN NEW."offerKind" = 'membership'
        THEN 'update_customer_membership_offer'
      WHEN NEW."availabilityState" = 'RETIRED'
        THEN 'delete_gift_certificate_offer'
      ELSE 'update_gift_certificate_offer'
    END;
  END IF;

  PERFORM "p409_require_owner_approved_execution"(
    NEW."tenantId",
    NEW."actionExecutionId",
    expected_action_class,
    'tenant_catalog_item',
    'tenant-catalog-item:' || NEW."offerId"
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER "TenantCatalogItemValueVersion_insert_guard"
BEFORE INSERT ON "TenantCatalogItemValueVersion"
FOR EACH ROW EXECUTE FUNCTION "guard_tenant_catalog_item_value_version_insert"();

CREATE FUNCTION "guard_tenant_catalog_item_value_version_append_only"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'TenantCatalogItemValueVersion is append-only'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "TenantCatalogItemValueVersion_append_only_guard"
BEFORE UPDATE OR DELETE ON "TenantCatalogItemValueVersion"
FOR EACH ROW EXECUTE FUNCTION "guard_tenant_catalog_item_value_version_append_only"();

CREATE FUNCTION "guard_tenant_catalog_item_current_value"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  current_version "TenantCatalogItemValueVersion"%ROWTYPE;
  previous_version "TenantCatalogItemValueVersion"%ROWTYPE;
BEGIN
  IF (
    OLD."kind" IN ('membership', 'certificate')
    OR NEW."kind" IN ('membership', 'certificate')
    OR OLD."currentValueVersionId" IS NOT NULL
    OR NEW."currentValueVersionId" IS NOT NULL
  ) AND (
    NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
  )
  THEN
    RAISE EXCEPTION 'Canonical offer internal identity, tenant, and kind are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."canonicalTemplateKey" IS NOT NULL
    AND NEW."canonicalTemplateKey" IS DISTINCT FROM
      OLD."canonicalTemplateKey"
  THEN
    RAISE EXCEPTION 'Established canonical offer template key is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."currentValueVersionId" IS NOT NULL
    AND NEW."currentValueVersionId" IS NULL
  THEN
    RAISE EXCEPTION 'Established canonical offer current version cannot be cleared'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."currentValueVersionId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO current_version
  FROM "TenantCatalogItemValueVersion"
  WHERE "id" = NEW."currentValueVersionId"
    AND "tenantId" = NEW."tenantId"
  FOR KEY SHARE;

  IF NOT FOUND
    OR current_version."offerId" IS DISTINCT FROM NEW."id"
    OR current_version."offerKind" IS DISTINCT FROM NEW."kind"
    OR current_version."templateKey" IS DISTINCT FROM
      NEW."canonicalTemplateKey"
    OR current_version."priceKopecks" IS DISTINCT FROM NEW."priceKopecks"
    OR current_version."currency" IS DISTINCT FROM NEW."currency"
    OR (
      current_version."availabilityState" = 'ACTIVE'
    ) IS DISTINCT FROM NEW."active"
  THEN
    RAISE EXCEPTION 'Catalog projection must match its exact current immutable value version'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."currentValueVersionId" IS NULL THEN
    IF current_version."previousVersionId" IS NOT NULL
      OR current_version."version" <> 1
    THEN
      RAISE EXCEPTION 'Canonical offer materialization must start at version 1'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."currentValueVersionId" IS DISTINCT FROM
    OLD."currentValueVersionId"
  THEN
    SELECT *
    INTO previous_version
    FROM "TenantCatalogItemValueVersion"
    WHERE "id" = OLD."currentValueVersionId"
      AND "tenantId" = OLD."tenantId"
    FOR KEY SHARE;

    IF NOT FOUND
      OR previous_version."availabilityState" = 'RETIRED'
      OR current_version."previousVersionId" IS DISTINCT FROM
        OLD."currentValueVersionId"
      OR current_version."version" IS DISTINCT FROM
        previous_version."version" + 1
    THEN
      RAISE EXCEPTION 'Canonical offer current pointer may advance only to its direct successor'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."priceKopecks" IS DISTINCT FROM OLD."priceKopecks"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."active" IS DISTINCT FROM OLD."active"
  THEN
    RAISE EXCEPTION 'Canonical offer value projection cannot change without a new version'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "TenantCatalogItem_current_value_guard"
BEFORE UPDATE OF
  "id",
  "tenantId",
  "kind",
  "canonicalTemplateKey",
  "currentValueVersionId",
  "priceKopecks",
  "currency",
  "active"
ON "TenantCatalogItem"
FOR EACH ROW EXECUTE FUNCTION "guard_tenant_catalog_item_current_value"();

CREATE FUNCTION "guard_tenant_catalog_item_canonical_delete"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD."currentValueVersionId" IS NOT NULL THEN
    RAISE EXCEPTION 'Canonical offer is retired by an immutable value version, not physical delete'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "TenantCatalogItem_canonical_delete_guard"
BEFORE DELETE ON "TenantCatalogItem"
FOR EACH ROW EXECUTE FUNCTION "guard_tenant_catalog_item_canonical_delete"();

CREATE FUNCTION "require_tenant_catalog_item_current_complete"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  stored_offer "TenantCatalogItem"%ROWTYPE;
BEGIN
  SELECT *
  INTO stored_offer
  FROM "TenantCatalogItem"
  WHERE "id" = NEW."id";

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF (stored_offer."canonicalTemplateKey" IS NULL)
    IS DISTINCT FROM (stored_offer."currentValueVersionId" IS NULL)
  THEN
    RAISE EXCEPTION 'Canonical offer template and current version must be established atomically'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "TenantCatalogItem_current_complete_guard"
AFTER INSERT OR UPDATE OF "canonicalTemplateKey", "currentValueVersionId"
ON "TenantCatalogItem"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "require_tenant_catalog_item_current_complete"();

CREATE FUNCTION "require_tenant_catalog_value_version_current"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "TenantCatalogItem"
    WHERE "id" = NEW."offerId"
      AND "tenantId" = NEW."tenantId"
      AND "currentValueVersionId" = NEW."id"
  )
  THEN
    RAISE EXCEPTION 'Offer value version and current projection must commit atomically'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "TenantCatalogItemValueVersion_current_guard"
AFTER INSERT ON "TenantCatalogItemValueVersion"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "require_tenant_catalog_value_version_current"();

CREATE FUNCTION "guard_referral_program_value_version_insert"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  program_row "ReferralProgram"%ROWTYPE;
  previous_row "ReferralProgramValueVersion"%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW."tenantId" || ':p4-09:referral-program', 0)
  );

  SELECT *
  INTO program_row
  FROM "ReferralProgram"
  WHERE "id" = NEW."programId"
    AND "tenantId" = NEW."tenantId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referral policy version must bind the exact tenant program'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."previousVersionId" IS NULL THEN
    IF NEW."version" <> 1
      OR program_row."currentValueVersionId" IS NOT NULL
    THEN
      RAISE EXCEPTION 'Initial referral policy value version must be generation 1'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT *
    INTO previous_row
    FROM "ReferralProgramValueVersion"
    WHERE "id" = NEW."previousVersionId"
      AND "tenantId" = NEW."tenantId"
    FOR KEY SHARE;

    IF NOT FOUND
      OR previous_row."programId" IS DISTINCT FROM NEW."programId"
      OR previous_row."version" + 1 IS DISTINCT FROM NEW."version"
      OR program_row."currentValueVersionId" IS DISTINCT FROM
        NEW."previousVersionId"
    THEN
      RAISE EXCEPTION 'Referral policy predecessor is stale, non-contiguous, or mismatched'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  PERFORM "p409_require_owner_approved_execution"(
    NEW."tenantId",
    NEW."actionExecutionId",
    'update_referral_reward_policy',
    'referral_program',
    'referral-program:' || NEW."programId"
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ReferralProgramValueVersion_insert_guard"
BEFORE INSERT ON "ReferralProgramValueVersion"
FOR EACH ROW EXECUTE FUNCTION "guard_referral_program_value_version_insert"();

CREATE FUNCTION "guard_referral_program_value_version_append_only"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'ReferralProgramValueVersion is append-only'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "ReferralProgramValueVersion_append_only_guard"
BEFORE UPDATE OR DELETE ON "ReferralProgramValueVersion"
FOR EACH ROW EXECUTE FUNCTION "guard_referral_program_value_version_append_only"();

CREATE FUNCTION "guard_referral_program_current_value"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  current_version "ReferralProgramValueVersion"%ROWTYPE;
  previous_version "ReferralProgramValueVersion"%ROWTYPE;
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
  THEN
    RAISE EXCEPTION 'Referral program internal identity and tenant are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."currentValueVersionId" IS NOT NULL
    AND NEW."currentValueVersionId" IS NULL
  THEN
    RAISE EXCEPTION 'Established referral policy current version cannot be cleared'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."currentValueVersionId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO current_version
  FROM "ReferralProgramValueVersion"
  WHERE "id" = NEW."currentValueVersionId"
    AND "tenantId" = NEW."tenantId"
  FOR KEY SHARE;

  IF NOT FOUND
    OR current_version."programId" IS DISTINCT FROM NEW."id"
    OR current_version."enabled" IS DISTINCT FROM NEW."enabled"
    OR current_version."inviterRewardKopecks" IS DISTINCT FROM
      NEW."inviterRewardKopecks"
    OR current_version."inviteeRewardKopecks" IS DISTINCT FROM
      NEW."inviteeRewardKopecks"
    OR current_version."inviterRewardPercentBasisPoints" IS DISTINCT FROM
      NEW."inviterRewardPercentBasisPoints"
    OR current_version."inviteeRewardPercentBasisPoints" IS DISTINCT FROM
      NEW."inviteeRewardPercentBasisPoints"
    OR current_version."inviterRewardLiabilityCapKopecks" IS DISTINCT FROM
      NEW."inviterRewardLiabilityCapKopecks"
    OR current_version."inviteeRewardLiabilityCapKopecks" IS DISTINCT FROM
      NEW."inviteeRewardLiabilityCapKopecks"
    OR current_version."currency" IS DISTINCT FROM NEW."currency"
  THEN
    RAISE EXCEPTION 'Referral policy projection must match its exact current immutable value version'
      USING ERRCODE = '23514';
  END IF;

  IF OLD."currentValueVersionId" IS NULL THEN
    IF current_version."previousVersionId" IS NOT NULL
      OR current_version."version" <> 1
    THEN
      RAISE EXCEPTION 'Referral policy materialization must start at version 1'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."currentValueVersionId" IS DISTINCT FROM
    OLD."currentValueVersionId"
  THEN
    SELECT *
    INTO previous_version
    FROM "ReferralProgramValueVersion"
    WHERE "id" = OLD."currentValueVersionId"
      AND "tenantId" = OLD."tenantId"
    FOR KEY SHARE;

    IF NOT FOUND
      OR current_version."previousVersionId" IS DISTINCT FROM
        OLD."currentValueVersionId"
      OR current_version."version" IS DISTINCT FROM
        previous_version."version" + 1
    THEN
      RAISE EXCEPTION 'Referral policy current pointer may advance only to its direct successor'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."enabled" IS DISTINCT FROM OLD."enabled"
    OR NEW."inviterRewardKopecks" IS DISTINCT FROM OLD."inviterRewardKopecks"
    OR NEW."inviteeRewardKopecks" IS DISTINCT FROM OLD."inviteeRewardKopecks"
    OR NEW."inviterRewardPercentBasisPoints" IS DISTINCT FROM
      OLD."inviterRewardPercentBasisPoints"
    OR NEW."inviteeRewardPercentBasisPoints" IS DISTINCT FROM
      OLD."inviteeRewardPercentBasisPoints"
    OR NEW."inviterRewardLiabilityCapKopecks" IS DISTINCT FROM
      OLD."inviterRewardLiabilityCapKopecks"
    OR NEW."inviteeRewardLiabilityCapKopecks" IS DISTINCT FROM
      OLD."inviteeRewardLiabilityCapKopecks"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
  THEN
    RAISE EXCEPTION 'Referral policy value projection cannot change without a new version'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ReferralProgram_current_value_guard"
BEFORE UPDATE OF
  "id",
  "tenantId",
  "currentValueVersionId",
  "enabled",
  "inviterRewardKopecks",
  "inviteeRewardKopecks",
  "inviterRewardPercentBasisPoints",
  "inviteeRewardPercentBasisPoints",
  "inviterRewardLiabilityCapKopecks",
  "inviteeRewardLiabilityCapKopecks",
  "currency"
ON "ReferralProgram"
FOR EACH ROW EXECUTE FUNCTION "guard_referral_program_current_value"();

CREATE FUNCTION "guard_referral_program_canonical_delete"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD."currentValueVersionId" IS NOT NULL THEN
    RAISE EXCEPTION 'Canonical referral program with value history cannot be physically deleted'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "ReferralProgram_canonical_delete_guard"
BEFORE DELETE ON "ReferralProgram"
FOR EACH ROW EXECUTE FUNCTION "guard_referral_program_canonical_delete"();

CREATE FUNCTION "require_referral_program_current_complete"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  stored_program "ReferralProgram"%ROWTYPE;
BEGIN
  SELECT *
  INTO stored_program
  FROM "ReferralProgram"
  WHERE "id" = NEW."id";

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF stored_program."currentValueVersionId" IS NULL
    AND EXISTS (
      SELECT 1
      FROM "ReferralProgramValueVersion"
      WHERE "programId" = stored_program."id"
        AND "tenantId" = stored_program."tenantId"
    )
  THEN
    RAISE EXCEPTION 'Referral policy version and current pointer must be established atomically'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ReferralProgram_current_complete_guard"
AFTER INSERT OR UPDATE OF "currentValueVersionId"
ON "ReferralProgram"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "require_referral_program_current_complete"();

CREATE FUNCTION "require_referral_program_value_version_current"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "ReferralProgram"
    WHERE "id" = NEW."programId"
      AND "tenantId" = NEW."tenantId"
      AND "currentValueVersionId" = NEW."id"
  )
  THEN
    RAISE EXCEPTION 'Referral policy version and current projection must commit atomically'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ReferralProgramValueVersion_current_guard"
AFTER INSERT ON "ReferralProgramValueVersion"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "require_referral_program_value_version_current"();
