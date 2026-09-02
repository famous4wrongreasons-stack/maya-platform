-- Cycle 06 Package 4 P4-06 gift-certificate presentation-key foundation.
-- Existing certificates remain nullable and receive no invented key version.
-- New canonical issuance must pin a non-secret presentation-key identifier so
-- the same bearer can be re-derived after restart without storing the bearer.

ALTER TABLE "GiftCertificate"
  ADD COLUMN "presentationKeyVersion" TEXT,
  ADD CONSTRAINT "GiftCertificate_presentation_key_version_check" CHECK (
    "presentationKeyVersion" IS NULL
    OR (
      char_length("presentationKeyVersion") BETWEEN 1 AND 64
      AND "presentationKeyVersion" ~ '^[A-Za-z][A-Za-z0-9._:-]*$'
    )
  );

CREATE FUNCTION "require_gift_certificate_presentation_version_on_insert"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."issueExecutionId" IS NOT NULL
    AND NEW."presentationKeyVersion" IS NULL
  THEN
    RAISE EXCEPTION 'New canonical gift certificates require a presentation key version'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "GiftCertificate_presentation_version_insert_guard"
BEFORE INSERT ON "GiftCertificate"
FOR EACH ROW EXECUTE FUNCTION "require_gift_certificate_presentation_version_on_insert"();

CREATE OR REPLACE FUNCTION "guard_gift_certificate_immutable_facts"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."issuanceIdentityHash" IS DISTINCT FROM OLD."issuanceIdentityHash"
    OR NEW."codeHash" IS DISTINCT FROM OLD."codeHash"
    OR NEW."recipientSubjectHash" IS DISTINCT FROM OLD."recipientSubjectHash"
    OR NEW."offerSnapshotHash" IS DISTINCT FROM OLD."offerSnapshotHash"
    OR NEW."nominalAmountKopecks" IS DISTINCT FROM OLD."nominalAmountKopecks"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt"
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR NEW."legacySourceRef" IS DISTINCT FROM OLD."legacySourceRef"
    OR (
      OLD."presentationKeyVersion" IS NOT NULL
      AND NEW."presentationKeyVersion" IS DISTINCT FROM OLD."presentationKeyVersion"
    )
    OR (
      OLD."issueExecutionId" IS NOT NULL
      AND NEW."issueExecutionId" IS DISTINCT FROM OLD."issueExecutionId"
    )
    OR (
      OLD."provider" IS NOT NULL
      AND NEW."provider" IS DISTINCT FROM OLD."provider"
    )
    OR (
      OLD."providerPaymentRefHash" IS NOT NULL
      AND NEW."providerPaymentRefHash" IS DISTINCT FROM OLD."providerPaymentRefHash"
    )
    OR (
      OLD."paymentStatus" <> 'pending_payment'
      AND (
        NEW."paymentStatus" IS DISTINCT FROM OLD."paymentStatus"
        OR NEW."paidAt" IS DISTINCT FROM OLD."paidAt"
        OR NEW."canceledAt" IS DISTINCT FROM OLD."canceledAt"
      )
    )
  THEN
    RAISE EXCEPTION 'GiftCertificate immutable issuance facts, presentation version, or established binding changed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
