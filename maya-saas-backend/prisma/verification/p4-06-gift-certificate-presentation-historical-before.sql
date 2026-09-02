\set ON_ERROR_STOP on

INSERT INTO "Tenant" ("id", "name", "slug", "updatedAt")
VALUES ('p406-historical-tenant', 'P4-06 Historical', 'p406-historical', CURRENT_TIMESTAMP);

INSERT INTO "GiftCertificate" (
  "id", "tenantId", "issuanceIdentityHash", "codeHash",
  "recipientSubjectHash", "offerSnapshotHash", "nominalAmountKopecks",
  "currency", "paymentStatus", "provider", "providerPaymentRefHash",
  "issuedAt", "expiresAt", "paidAt", "legacySourceRef", "updatedAt"
) VALUES (
  'p406-historical-cert', 'p406-historical-tenant',
  'p406-historical-issuance', 'p406-historical-code-hash',
  'p406-historical-recipient', 'p406-historical-offer', 300000,
  'RUB', 'paid', 'yookassa', 'p406-historical-payment-hash',
  '2026-01-01 00:00:00+00', '2026-12-31 00:00:00+00',
  '2026-01-01 00:00:00+00', 'legacy:p406:certificate:1', CURRENT_TIMESTAMP
);

INSERT INTO "GiftCertificateRedemption" (
  "id", "tenantId", "certificateId", "targetKind", "targetRefHash",
  "redeemedAt", "legacySourceRef"
) VALUES (
  'p406-historical-redemption', 'p406-historical-tenant',
  'p406-historical-cert', 'legacy_sale', 'p406-historical-target-hash',
  '2026-06-01 00:00:00+00', 'legacy:p406:redemption:1'
);

SELECT 'P4-06 historical fixture before migration: READY' AS result;
