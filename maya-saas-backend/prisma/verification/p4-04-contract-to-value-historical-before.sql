\set ON_ERROR_STOP on

INSERT INTO "Tenant" ("id", "name", "slug", "updatedAt")
VALUES ('p404-historical-tenant', 'P4-04 Historical', 'p404-historical', CURRENT_TIMESTAMP);

INSERT INTO "Client" ("id", "tenantId", "updatedAt")
VALUES ('p404-historical-client', 'p404-historical-tenant', CURRENT_TIMESTAMP);

INSERT INTO "ReferralProgram" (
  "id", "tenantId", "enabled", "inviterRewardKopecks", "currency", "updatedAt"
) VALUES (
  'p404-historical-program', 'p404-historical-tenant', true, 1500, 'RUB', CURRENT_TIMESTAMP
);

INSERT INTO "CustomerReferral" (
  "id", "tenantId", "referrerClientId", "referredClientId", "identityHash",
  "referredSubjectHash", "referralCodeHash", "status", "joinedAt", "resolvedAt"
) VALUES (
  'p404-historical-referral', 'p404-historical-tenant',
  'p404-historical-client', 'p404-historical-client', 'p404-historical-identity',
  'p404-historical-subject', 'p404-historical-referral-code', 'qualified',
  '2026-01-01 00:00:00+00', '2026-01-02 00:00:00+00'
);

INSERT INTO "ReferralRewardIssuance" (
  "id", "tenantId", "referralId", "policySnapshotHash", "issuedAt"
) VALUES (
  'p404-historical-issuance', 'p404-historical-tenant',
  'p404-historical-referral', 'p404-historical-policy', '2026-01-03 00:00:00+00'
);

INSERT INTO "ReferralReward" (
  "id", "tenantId", "issuanceId", "recipientClientId", "rewardSlot",
  "codeHash", "amountKopecks", "currency", "issuedAt", "expiresAt"
) VALUES (
  'p404-historical-reward', 'p404-historical-tenant',
  'p404-historical-issuance', 'p404-historical-client', 'invitee',
  'p404-historical-claim-hash', 1500, 'RUB',
  '2026-01-03 00:00:00+00', '2026-02-03 00:00:00+00'
);

INSERT INTO "ReferralRewardFulfillment" (
  "id", "tenantId", "rewardId", "fulfilledAt", "legacySourceRef"
) VALUES (
  'p404-historical-fulfillment', 'p404-historical-tenant',
  'p404-historical-reward', '2026-01-10 00:00:00+00', 'legacy:p404:fulfillment:1'
);

SELECT 'P4-04 historical fixture before migration: READY' AS result;
