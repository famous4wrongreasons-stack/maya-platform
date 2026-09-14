-- Cycle 06 Blocking Package 4 schema-only gift-certificate foundation.
-- Issuance/payment reconciliation and one-time redemption remain separate
-- business operations. Legacy rows are not backfilled; safely correlated
-- historical rows retain null ActionExecution bindings.

CREATE TABLE "GiftCertificate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "issueExecutionId" TEXT,
  "issuanceIdentityHash" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "recipientSubjectHash" TEXT NOT NULL,
  "offerSnapshotHash" TEXT NOT NULL,
  "nominalAmountKopecks" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "paymentStatus" TEXT NOT NULL DEFAULT 'pending_payment',
  "provider" TEXT,
  "providerPaymentRefHash" TEXT,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "legacySourceRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GiftCertificate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GiftCertificate_shape_check" CHECK (
    btrim("issuanceIdentityHash") <> ''
    AND btrim("codeHash") <> ''
    AND btrim("recipientSubjectHash") <> ''
    AND btrim("offerSnapshotHash") <> ''
    AND btrim("currency") <> ''
    AND "nominalAmountKopecks" > 0
    AND "expiresAt" > "issuedAt"
    AND "paymentStatus" IN ('pending_payment', 'paid', 'canceled')
    AND (
      (
        "paymentStatus" = 'pending_payment'
        AND "paidAt" IS NULL
        AND "canceledAt" IS NULL
      )
      OR (
        "paymentStatus" = 'paid'
        AND "paidAt" IS NOT NULL
        AND "canceledAt" IS NULL
      )
      OR (
        "paymentStatus" = 'canceled'
        AND "paidAt" IS NULL
        AND "canceledAt" IS NOT NULL
      )
    )
    AND (
      ("provider" IS NULL AND "providerPaymentRefHash" IS NULL)
      OR (
        "provider" IS NOT NULL
        AND btrim("provider") <> ''
        AND "providerPaymentRefHash" IS NOT NULL
        AND btrim("providerPaymentRefHash") <> ''
      )
    )
    AND ("legacySourceRef" IS NULL OR btrim("legacySourceRef") <> '')
    AND (
      "issueExecutionId" IS NOT NULL
      OR "legacySourceRef" IS NOT NULL
    )
  )
);

CREATE TABLE "GiftCertificateRedemption" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "certificateId" TEXT NOT NULL,
  "actionExecutionId" TEXT,
  "targetKind" TEXT NOT NULL,
  "targetRefHash" TEXT NOT NULL,
  "redeemedAt" TIMESTAMP(3) NOT NULL,
  "legacySourceRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GiftCertificateRedemption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GiftCertificateRedemption_shape_check" CHECK (
    btrim("targetKind") <> ''
    AND btrim("targetRefHash") <> ''
    AND ("legacySourceRef" IS NULL OR btrim("legacySourceRef") <> '')
    AND (
      "actionExecutionId" IS NOT NULL
      OR "legacySourceRef" IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX "GiftCertificate_id_tenantId_key"
  ON "GiftCertificate"("id", "tenantId");
CREATE UNIQUE INDEX "GiftCertificate_tenantId_issuanceIdentityHash_key"
  ON "GiftCertificate"("tenantId", "issuanceIdentityHash");
CREATE UNIQUE INDEX "GiftCertificate_tenantId_codeHash_key"
  ON "GiftCertificate"("tenantId", "codeHash");
CREATE UNIQUE INDEX "GiftCertificate_issueExecutionId_tenantId_key"
  ON "GiftCertificate"("issueExecutionId", "tenantId");
CREATE UNIQUE INDEX "GiftCertificate_tenantId_provider_providerPaymentRefHash_key"
  ON "GiftCertificate"("tenantId", "provider", "providerPaymentRefHash");
CREATE UNIQUE INDEX "GiftCertificate_tenantId_legacySourceRef_key"
  ON "GiftCertificate"("tenantId", "legacySourceRef");
CREATE INDEX "GiftCertificate_tenantId_paymentStatus_expiresAt_idx"
  ON "GiftCertificate"("tenantId", "paymentStatus", "expiresAt");
CREATE INDEX "GiftCertificate_tenantId_recipientSubjectHash_expiresAt_idx"
  ON "GiftCertificate"("tenantId", "recipientSubjectHash", "expiresAt");

CREATE UNIQUE INDEX "GiftCertificateRedemption_id_tenantId_key"
  ON "GiftCertificateRedemption"("id", "tenantId");
CREATE UNIQUE INDEX "GiftCertificateRedemption_certificateId_tenantId_key"
  ON "GiftCertificateRedemption"("certificateId", "tenantId");
CREATE UNIQUE INDEX "GiftCertificateRedemption_actionExecutionId_tenantId_key"
  ON "GiftCertificateRedemption"("actionExecutionId", "tenantId");
CREATE UNIQUE INDEX "GiftCertificateRedemption_tenantId_legacySourceRef_key"
  ON "GiftCertificateRedemption"("tenantId", "legacySourceRef");
CREATE INDEX "GiftCertificateRedemption_tenantId_redeemedAt_idx"
  ON "GiftCertificateRedemption"("tenantId", "redeemedAt");

ALTER TABLE "GiftCertificate"
  ADD CONSTRAINT "GiftCertificate_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "GiftCertificate_issueExecutionId_tenantId_fkey"
  FOREIGN KEY ("issueExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "GiftCertificateRedemption"
  ADD CONSTRAINT "GiftCertificateRedemption_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "GiftCertificateRedemption_certificateId_tenantId_fkey"
  FOREIGN KEY ("certificateId", "tenantId")
  REFERENCES "GiftCertificate"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "GiftCertificateRedemption_actionExecutionId_tenantId_fkey"
  FOREIGN KEY ("actionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "guard_gift_certificate_immutable_facts"()
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
    RAISE EXCEPTION 'GiftCertificate immutable issuance facts or established execution/provider binding changed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "GiftCertificate_immutable_facts_guard"
BEFORE UPDATE ON "GiftCertificate"
FOR EACH ROW EXECUTE FUNCTION "guard_gift_certificate_immutable_facts"();

CREATE FUNCTION "claim_one_time_gift_certificate_redemption"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  certificate_status TEXT;
  certificate_paid_at TIMESTAMP(3);
  certificate_expires_at TIMESTAMP(3);
BEGIN
  SELECT "paymentStatus", "paidAt", "expiresAt"
  INTO certificate_status, certificate_paid_at, certificate_expires_at
  FROM "GiftCertificate"
  WHERE "id" = NEW."certificateId"
    AND "tenantId" = NEW."tenantId"
  FOR UPDATE;

  -- Let the tenant-qualified FK produce the canonical missing/cross-tenant
  -- rejection when the certificate is not visible in this tenant.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF certificate_status <> 'paid'
    OR NEW."redeemedAt" < certificate_paid_at
    OR NEW."redeemedAt" > certificate_expires_at
  THEN
    RAISE EXCEPTION 'GiftCertificateRedemption requires a paid, unexpired certificate'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "GiftCertificateRedemption_one_time_guard"
BEFORE INSERT ON "GiftCertificateRedemption"
FOR EACH ROW EXECUTE FUNCTION "claim_one_time_gift_certificate_redemption"();

CREATE FUNCTION "guard_gift_certificate_redemption_immutable"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."certificateId" IS DISTINCT FROM OLD."certificateId"
    OR NEW."targetKind" IS DISTINCT FROM OLD."targetKind"
    OR NEW."targetRefHash" IS DISTINCT FROM OLD."targetRefHash"
    OR NEW."redeemedAt" IS DISTINCT FROM OLD."redeemedAt"
    OR NEW."legacySourceRef" IS DISTINCT FROM OLD."legacySourceRef"
    OR (
      OLD."actionExecutionId" IS NOT NULL
      AND NEW."actionExecutionId" IS DISTINCT FROM OLD."actionExecutionId"
    )
  THEN
    RAISE EXCEPTION 'GiftCertificateRedemption identity and established action binding are immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "GiftCertificateRedemption_immutable_guard"
BEFORE UPDATE ON "GiftCertificateRedemption"
FOR EACH ROW EXECUTE FUNCTION "guard_gift_certificate_redemption_immutable"();
