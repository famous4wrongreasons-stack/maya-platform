-- Cycle 06 Blocking Package 4 P4-09 offer replacement lineage.
-- A retired canonical offer remains immutable history. A future offer for the
-- same server-owned template receives a new internal identity and explicitly
-- supersedes the exact retired predecessor. No historical lineage is inferred.

ALTER TABLE "TenantCatalogItem"
  ADD COLUMN "supersedesOfferId" TEXT;

DROP INDEX "TenantCatalogItem_tenantId_kind_canonicalTemplateKey_key";

CREATE INDEX "TenantCatalogItem_tenant_kind_template_idx"
  ON "TenantCatalogItem"("tenantId", "kind", "canonicalTemplateKey");

CREATE UNIQUE INDEX "TenantCatalogItem_supersedesOfferId_tenantId_key"
  ON "TenantCatalogItem"("supersedesOfferId", "tenantId");

ALTER TABLE "TenantCatalogItem"
  ADD CONSTRAINT "TenantCatalogItem_supersedesOfferId_tenantId_fkey"
  FOREIGN KEY ("supersedesOfferId", "tenantId")
  REFERENCES "TenantCatalogItem"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "guard_tenant_catalog_item_lineage_immutable"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."supersedesOfferId" IS DISTINCT FROM OLD."supersedesOfferId" THEN
    RAISE EXCEPTION 'Established canonical offer replacement lineage is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "TenantCatalogItem_lineage_immutable_guard"
BEFORE UPDATE OF "supersedesOfferId" ON "TenantCatalogItem"
FOR EACH ROW EXECUTE FUNCTION "guard_tenant_catalog_item_lineage_immutable"();

CREATE OR REPLACE FUNCTION "guard_tenant_catalog_item_value_version_insert"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  offer_row "TenantCatalogItem"%ROWTYPE;
  previous_row "TenantCatalogItemValueVersion"%ROWTYPE;
  predecessor_row "TenantCatalogItem"%ROWTYPE;
  predecessor_current "TenantCatalogItemValueVersion"%ROWTYPE;
  expected_action_class TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      NEW."tenantId"
        || ':p4-09:offer-template:'
        || NEW."offerKind"
        || ':'
        || NEW."templateKey",
      0
    )
  );

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

    IF offer_row."supersedesOfferId" IS NOT NULL THEN
      IF offer_row."supersedesOfferId" = offer_row."id" THEN
        RAISE EXCEPTION 'Canonical offer cannot supersede itself'
          USING ERRCODE = '23514';
      END IF;

      SELECT *
      INTO predecessor_row
      FROM "TenantCatalogItem"
      WHERE "id" = offer_row."supersedesOfferId"
        AND "tenantId" = offer_row."tenantId"
      FOR KEY SHARE;

      IF NOT FOUND
        OR predecessor_row."kind" IS DISTINCT FROM offer_row."kind"
        OR predecessor_row."canonicalTemplateKey" IS DISTINCT FROM
          offer_row."canonicalTemplateKey"
        OR predecessor_row."currentValueVersionId" IS NULL
      THEN
        RAISE EXCEPTION 'Replacement must bind the exact same-tenant, kind, and template predecessor'
          USING ERRCODE = '23514';
      END IF;

      SELECT *
      INTO predecessor_current
      FROM "TenantCatalogItemValueVersion"
      WHERE "id" = predecessor_row."currentValueVersionId"
        AND "tenantId" = predecessor_row."tenantId"
      FOR KEY SHARE;

      IF NOT FOUND OR predecessor_current."availabilityState" <> 'RETIRED'
      THEN
        RAISE EXCEPTION 'Replacement predecessor must be durably retired'
          USING ERRCODE = '23514';
      END IF;
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

CREATE FUNCTION "require_tenant_catalog_item_replacement_lineage"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  checked_offer_id TEXT;
  checked_tenant_id TEXT;
  stored_offer "TenantCatalogItem"%ROWTYPE;
  current_version "TenantCatalogItemValueVersion"%ROWTYPE;
  predecessor_row "TenantCatalogItem"%ROWTYPE;
  predecessor_current "TenantCatalogItemValueVersion"%ROWTYPE;
  root_count INTEGER;
  live_authority_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'TenantCatalogItemValueVersion' THEN
    checked_offer_id := NEW."offerId";
    checked_tenant_id := NEW."tenantId";
  ELSE
    checked_offer_id := NEW."id";
    checked_tenant_id := NEW."tenantId";
  END IF;

  SELECT *
  INTO stored_offer
  FROM "TenantCatalogItem"
  WHERE "id" = checked_offer_id
    AND "tenantId" = checked_tenant_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF stored_offer."canonicalTemplateKey" IS NULL THEN
    IF stored_offer."supersedesOfferId" IS NOT NULL THEN
      RAISE EXCEPTION 'Historical unversioned offer cannot carry replacement lineage'
        USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END IF;

  IF stored_offer."currentValueVersionId" IS NULL THEN
    RAISE EXCEPTION 'Canonical replacement authority requires an exact current value version'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      stored_offer."tenantId"
        || ':p4-09:offer-template:'
        || stored_offer."kind"
        || ':'
        || stored_offer."canonicalTemplateKey",
      0
    )
  );

  SELECT *
  INTO current_version
  FROM "TenantCatalogItemValueVersion"
  WHERE "id" = stored_offer."currentValueVersionId"
    AND "tenantId" = stored_offer."tenantId";

  IF NOT FOUND
    OR current_version."offerId" IS DISTINCT FROM stored_offer."id"
    OR current_version."offerKind" IS DISTINCT FROM stored_offer."kind"
    OR current_version."templateKey" IS DISTINCT FROM
      stored_offer."canonicalTemplateKey"
  THEN
    RAISE EXCEPTION 'Canonical offer authority must bind its exact current immutable version'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
  INTO root_count
  FROM "TenantCatalogItem"
  WHERE "tenantId" = stored_offer."tenantId"
    AND "kind" = stored_offer."kind"
    AND "canonicalTemplateKey" = stored_offer."canonicalTemplateKey"
    AND "supersedesOfferId" IS NULL;

  IF root_count <> 1 THEN
    RAISE EXCEPTION 'Canonical offer template lineage must have exactly one immutable root'
      USING ERRCODE = '23514';
  END IF;

  IF stored_offer."supersedesOfferId" IS NOT NULL THEN
    IF stored_offer."supersedesOfferId" = stored_offer."id" THEN
      RAISE EXCEPTION 'Canonical offer cannot supersede itself'
        USING ERRCODE = '23514';
    END IF;

    SELECT *
    INTO predecessor_row
    FROM "TenantCatalogItem"
    WHERE "id" = stored_offer."supersedesOfferId"
      AND "tenantId" = stored_offer."tenantId";

    IF NOT FOUND
      OR predecessor_row."kind" IS DISTINCT FROM stored_offer."kind"
      OR predecessor_row."canonicalTemplateKey" IS DISTINCT FROM
        stored_offer."canonicalTemplateKey"
      OR predecessor_row."currentValueVersionId" IS NULL
    THEN
      RAISE EXCEPTION 'Replacement lineage predecessor is incompatible'
        USING ERRCODE = '23514';
    END IF;

    SELECT *
    INTO predecessor_current
    FROM "TenantCatalogItemValueVersion"
    WHERE "id" = predecessor_row."currentValueVersionId"
      AND "tenantId" = predecessor_row."tenantId";

    IF NOT FOUND OR predecessor_current."availabilityState" <> 'RETIRED'
    THEN
      RAISE EXCEPTION 'Replacement lineage predecessor must remain retired'
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM "TenantCatalogItemValueVersion"
      WHERE "tenantId" = stored_offer."tenantId"
        AND "offerId" = stored_offer."id"
        AND "version" = 1
        AND "previousVersionId" IS NULL
    )
    THEN
      RAISE EXCEPTION 'Replacement internal identity must start a new version chain'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT count(*)
  INTO live_authority_count
  FROM "TenantCatalogItem" AS offer
  JOIN "TenantCatalogItemValueVersion" AS version
    ON version."id" = offer."currentValueVersionId"
   AND version."tenantId" = offer."tenantId"
  WHERE offer."tenantId" = stored_offer."tenantId"
    AND offer."kind" = stored_offer."kind"
    AND offer."canonicalTemplateKey" = stored_offer."canonicalTemplateKey"
    AND version."availabilityState" <> 'RETIRED';

  IF live_authority_count > 1 THEN
    RAISE EXCEPTION 'Only one non-retired canonical authority may own a tenant offer template'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "TenantCatalogItem_replacement_lineage_guard"
AFTER INSERT OR UPDATE OF
  "tenantId",
  "kind",
  "canonicalTemplateKey",
  "supersedesOfferId",
  "currentValueVersionId"
ON "TenantCatalogItem"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "require_tenant_catalog_item_replacement_lineage"();

CREATE CONSTRAINT TRIGGER "TenantCatalogItemValueVersion_live_authority_guard"
AFTER INSERT ON "TenantCatalogItemValueVersion"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "require_tenant_catalog_item_replacement_lineage"();
