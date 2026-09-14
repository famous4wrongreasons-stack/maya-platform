-- Package 5 B9 Option A: the verified channel subject remains the identity key.
-- This nullable ciphertext is only a reversible delivery address. Existing links
-- are deliberately left NULL; no historical address is inferred or backfilled.
ALTER TABLE "ClientChannelLink"
  ADD COLUMN "deliveryAddressEncrypted" TEXT;

ALTER TABLE "ClientChannelLink"
  ADD CONSTRAINT "ClientChannelLink_delivery_address_check" CHECK (
    "deliveryAddressEncrypted" IS NULL
    OR (
      octet_length("deliveryAddressEncrypted") BETWEEN 42 AND 512
      AND "deliveryAddressEncrypted" ~ '^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$'
    )
  );

-- The verified service sets a transaction-local copy of the already-computed
-- canonical HMAC before inserting or rotating an encrypted address. The trigger
-- never treats ciphertext or plaintext as identity authority.
CREATE OR REPLACE FUNCTION "guard_client_channel_link_v1"() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  prior_id TEXT;
  prior_revoked TIMESTAMP(3);
  latest_count INTEGER;
  verified_delivery_hash TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ClientChannelLink historical evidence cannot be deleted' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    jsonb_build_array('a18.client-channel.v1', NEW."tenantId", NEW."provider", NEW."providerSubjectHash")::TEXT, 0));

  verified_delivery_hash := current_setting('maya.client_channel_delivery_subject_hash', true);

  IF TG_OP = 'UPDATE' THEN
    IF NEW."deliveryAddressEncrypted" IS DISTINCT FROM OLD."deliveryAddressEncrypted"
       AND (to_jsonb(NEW) - 'deliveryAddressEncrypted') =
           (to_jsonb(OLD) - 'deliveryAddressEncrypted')
    THEN
      IF OLD."revokedAt" IS NOT NULL OR NEW."deliveryAddressEncrypted" IS NULL
         OR verified_delivery_hash IS DISTINCT FROM OLD."providerSubjectHash"
      THEN
        RAISE EXCEPTION 'ClientChannelLink delivery address requires the matching active verified channel' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END IF;

    IF (to_jsonb(NEW) - ARRAY['revokedAt', 'revocationIdentityHash', 'revocationEvidenceJson', 'revocationEvidenceHash'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['revokedAt', 'revocationIdentityHash', 'revocationEvidenceJson', 'revocationEvidenceHash'])
      OR OLD."revokedAt" IS NOT NULL OR NEW."revokedAt" IS NULL
    THEN
      RAISE EXCEPTION 'ClientChannelLink permits only verified delivery rotation or first complete revocation; original evidence is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW."revokedAt" > (clock_timestamp() AT TIME ZONE 'UTC')::TIMESTAMP(3) THEN
      RAISE EXCEPTION 'ClientChannelLink revocation cannot be future-dated' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."deliveryAddressEncrypted" IS NOT NULL
     AND verified_delivery_hash IS DISTINCT FROM NEW."providerSubjectHash"
  THEN
    RAISE EXCEPTION 'ClientChannelLink delivery address requires the matching verified channel' USING ERRCODE = '23514';
  END IF;
  IF NEW."revokedAt" IS NOT NULL OR NEW."createdAt" > (clock_timestamp() AT TIME ZONE 'UTC')::TIMESTAMP(3)
     OR NEW."verifiedAt" > (clock_timestamp() AT TIME ZONE 'UTC')::TIMESTAMP(3) THEN
    RAISE EXCEPTION 'ClientChannelLink must start as a currently verified episode' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM "Client" WHERE "id" = NEW."clientId" AND "tenantId" = NEW."tenantId"
    AND "mergedIntoClientId" IS NULL FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ClientChannelLink requires an exact unmerged tenant Client' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO latest_count FROM "ClientChannelLink" p
    WHERE p."tenantId" = NEW."tenantId" AND p."provider" = NEW."provider"
      AND p."providerSubjectHash" = NEW."providerSubjectHash"
      AND NOT EXISTS (SELECT 1 FROM "ClientChannelLink" s WHERE s."supersedesLinkId" = p."id");
  IF latest_count = 0 THEN
    IF NEW."supersedesLinkId" IS NOT NULL THEN
      RAISE EXCEPTION 'Initial ClientChannelLink cannot claim a predecessor' USING ERRCODE = '23514';
    END IF;
  ELSIF latest_count = 1 THEN
    SELECT p."id", p."revokedAt" INTO prior_id, prior_revoked FROM "ClientChannelLink" p
      WHERE p."tenantId" = NEW."tenantId" AND p."provider" = NEW."provider"
        AND p."providerSubjectHash" = NEW."providerSubjectHash"
        AND NOT EXISTS (SELECT 1 FROM "ClientChannelLink" s WHERE s."supersedesLinkId" = p."id");
    IF NEW."supersedesLinkId" IS DISTINCT FROM prior_id OR prior_revoked IS NULL THEN
      RAISE EXCEPTION 'ClientChannelLink re-link requires the latest explicitly revoked predecessor' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'Ambiguous ClientChannelLink history requires explicit repair' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
