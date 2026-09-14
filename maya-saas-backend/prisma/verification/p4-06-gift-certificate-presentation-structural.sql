\set ON_ERROR_STOP on

CREATE FUNCTION pg_temp.expect_constraint_failure(label TEXT, statement TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION
    WHEN check_violation OR foreign_key_violation OR unique_violation THEN
      RETURN;
  END;

  RAISE EXCEPTION 'Expected constraint failure: %', label;
END;
$$;

INSERT INTO "Tenant" ("id", "name", "slug", "updatedAt") VALUES
  ('p406-t1', 'P4-06 Tenant 1', 'p406-t1', CURRENT_TIMESTAMP),
  ('p406-t2', 'P4-06 Tenant 2', 'p406-t2', CURRENT_TIMESTAMP);

INSERT INTO "ActionExecution" (
  "id", "tenantId", "identityVersion", "identityFingerprint",
  "sourceType", "actionClass", "capability", "capabilityVersion",
  "targetKind", "targetRef", "normalizedInputContract",
  "normalizedInputHash", "evidenceRefsJson", "dryRun",
  "riskProfileVersion", "riskFacetsJson", "policyKey", "policyVersion",
  "policyDecision", "autonomyLevel", "policyDecidedBy",
  "approvalRequirement", "approvalDecision", "state", "retryPolicyKey",
  "retryPolicyVersion", "maxExecutionAttempts", "reconciliationPolicyKey",
  "reconciliationPolicyVersion", "reconciliationState",
  "transportIdentityVersion", "transportIdempotencyKey", "updatedAt"
) VALUES
  (
    'p406-exec-1', 'p406-t1', 1, 'p406-exec-fingerprint-1',
    'authenticated_request', 'activate_gift_certificate', 'gift_certificate.activate', 1,
    'gift_certificate', 'p406-cert-1', 'p4-06.gift-certificate-activation.v1',
    'p406-input-hash-1', '[]'::jsonb, false, 1, '[]'::jsonb,
    'p4-06.gift-certificate-activation', 1, 'ALLOW', 'L3',
    'canonical_ingress', 'NONE', 'NOT_REQUIRED', 'READY',
    'no-blind-retry', 1, 1, 'gift-certificate-payment-reconciliation', 1,
    'NOT_REQUIRED', 1, 'p406-transport-1', CURRENT_TIMESTAMP
  ),
  (
    'p406-exec-2', 'p406-t2', 1, 'p406-exec-fingerprint-2',
    'authenticated_request', 'activate_gift_certificate', 'gift_certificate.activate', 1,
    'gift_certificate', 'p406-cert-2', 'p4-06.gift-certificate-activation.v1',
    'p406-input-hash-2', '[]'::jsonb, false, 1, '[]'::jsonb,
    'p4-06.gift-certificate-activation', 1, 'ALLOW', 'L3',
    'canonical_ingress', 'NONE', 'NOT_REQUIRED', 'READY',
    'no-blind-retry', 1, 1, 'gift-certificate-payment-reconciliation', 1,
    'NOT_REQUIRED', 1, 'p406-transport-2', CURRENT_TIMESTAMP
  );

SELECT pg_temp.expect_constraint_failure(
  'new canonical issuance requires a presentation key version',
  $statement$
    INSERT INTO "GiftCertificate" (
      "id", "tenantId", "issueExecutionId", "issuanceIdentityHash", "codeHash",
      "recipientSubjectHash", "offerSnapshotHash", "nominalAmountKopecks",
      "currency", "paymentStatus", "provider", "providerPaymentRefHash",
      "issuedAt", "expiresAt", "paidAt", "updatedAt"
    ) VALUES (
      'p406-cert-missing-version', 'p406-t1', 'p406-exec-1',
      'p406-issuance-missing-version', 'p406-code-missing-version',
      'p406-recipient-missing-version', 'p406-offer-missing-version', 300000,
      'RUB', 'paid', 'yookassa', 'p406-payment-missing-version',
      '2026-09-02 10:00:00+00', '2027-09-02 10:00:00+00',
      '2026-09-02 10:00:00+00', CURRENT_TIMESTAMP
    )
  $statement$
);

INSERT INTO "GiftCertificate" (
  "id", "tenantId", "issueExecutionId", "issuanceIdentityHash", "codeHash",
  "presentationKeyVersion", "recipientSubjectHash", "offerSnapshotHash",
  "nominalAmountKopecks", "currency", "paymentStatus", "provider",
  "providerPaymentRefHash", "issuedAt", "expiresAt", "paidAt", "updatedAt"
) VALUES (
  'p406-cert-1', 'p406-t1', 'p406-exec-1', 'p406-issuance-1',
  'p406-code-hash-1', 'gift-certificate-presentation.v1',
  'p406-recipient-1', 'p406-offer-1', 300000, 'RUB', 'paid', 'yookassa',
  'p406-payment-hash-1', '2026-09-02 10:00:00+00',
  '2027-09-02 10:00:00+00', '2026-09-02 10:00:00+00', CURRENT_TIMESTAMP
);

SELECT pg_temp.expect_constraint_failure(
  'established presentation key version cannot be cleared',
  $statement$
    UPDATE "GiftCertificate"
    SET "presentationKeyVersion" = NULL
    WHERE "id" = 'p406-cert-1'
  $statement$
);

SELECT pg_temp.expect_constraint_failure(
  'established presentation key version cannot be replaced',
  $statement$
    UPDATE "GiftCertificate"
    SET "presentationKeyVersion" = 'gift-certificate-presentation.v2'
    WHERE "id" = 'p406-cert-1'
  $statement$
);

SELECT pg_temp.expect_constraint_failure(
  'cross-tenant activation execution remains rejected',
  $statement$
    INSERT INTO "GiftCertificate" (
      "id", "tenantId", "issueExecutionId", "issuanceIdentityHash", "codeHash",
      "presentationKeyVersion", "recipientSubjectHash", "offerSnapshotHash",
      "nominalAmountKopecks", "currency", "paymentStatus", "provider",
      "providerPaymentRefHash", "issuedAt", "expiresAt", "paidAt", "updatedAt"
    ) VALUES (
      'p406-cert-cross-tenant', 'p406-t1', 'p406-exec-2',
      'p406-issuance-cross-tenant', 'p406-code-cross-tenant',
      'gift-certificate-presentation.v1', 'p406-recipient-cross-tenant',
      'p406-offer-cross-tenant', 300000, 'RUB', 'paid', 'yookassa',
      'p406-payment-cross-tenant', '2026-09-02 10:00:00+00',
      '2027-09-02 10:00:00+00', '2026-09-02 10:00:00+00', CURRENT_TIMESTAMP
    )
  $statement$
);

SELECT pg_temp.expect_constraint_failure(
  'restart cannot assign a second key-version identity to the same issuance execution',
  $statement$
    INSERT INTO "GiftCertificate" (
      "id", "tenantId", "issueExecutionId", "issuanceIdentityHash", "codeHash",
      "presentationKeyVersion", "recipientSubjectHash", "offerSnapshotHash",
      "nominalAmountKopecks", "currency", "paymentStatus", "provider",
      "providerPaymentRefHash", "issuedAt", "expiresAt", "paidAt", "updatedAt"
    ) VALUES (
      'p406-cert-restart', 'p406-t1', 'p406-exec-1',
      'p406-issuance-restart', 'p406-code-restart',
      'gift-certificate-presentation.v2', 'p406-recipient-restart',
      'p406-offer-restart', 300000, 'RUB', 'paid', 'yookassa',
      'p406-payment-restart', '2026-09-02 10:00:00+00',
      '2027-09-02 10:00:00+00', '2026-09-02 10:00:00+00', CURRENT_TIMESTAMP
    )
  $statement$
);

SELECT pg_temp.expect_constraint_failure(
  'blank presentation version is not a key identifier',
  $statement$
    INSERT INTO "GiftCertificate" (
      "id", "tenantId", "issuanceIdentityHash", "codeHash",
      "presentationKeyVersion", "recipientSubjectHash", "offerSnapshotHash",
      "nominalAmountKopecks", "currency", "paymentStatus", "issuedAt",
      "expiresAt", "legacySourceRef", "updatedAt"
    ) VALUES (
      'p406-cert-blank-version', 'p406-t1', 'p406-issuance-blank',
      'p406-code-blank', ' ', 'p406-recipient-blank', 'p406-offer-blank',
      300000, 'RUB', 'pending_payment', '2026-09-02 10:00:00+00',
      '2027-09-02 10:00:00+00', 'legacy:p406:blank', CURRENT_TIMESTAMP
    )
  $statement$
);

INSERT INTO "GiftCertificateRedemption" (
  "id", "tenantId", "certificateId", "targetKind", "targetRefHash",
  "redeemedAt", "legacySourceRef"
) VALUES (
  'p406-redemption-1', 'p406-t1', 'p406-cert-1', 'sale',
  'p406-target-hash-1', '2026-09-03 10:00:00+00',
  'legacy:p406:redemption-proof:1'
);

DO $$
BEGIN
  IF (
    SELECT "presentationKeyVersion"
    FROM "GiftCertificate"
    WHERE "id" = 'p406-cert-1'
  ) <> 'gift-certificate-presentation.v1' THEN
    RAISE EXCEPTION 'Canonical certificate lost its presentation key version';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "GiftCertificateRedemption"
    WHERE "id" = 'p406-redemption-1'
      AND "certificateId" = 'p406-cert-1'
      AND "tenantId" = 'p406-t1'
  ) THEN
    RAISE EXCEPTION 'Existing redemption binding no longer works';
  END IF;
END;
$$;

SELECT 'P4-06 gift certificate presentation schema proof: PASS' AS result;
