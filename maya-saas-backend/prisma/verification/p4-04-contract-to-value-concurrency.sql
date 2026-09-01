\set ON_ERROR_STOP on

INSERT INTO "CustomerReferral" (
  "id", "tenantId", "referrerClientId", "referredClientId", "identityHash",
  "referredSubjectHash", "referralCodeHash", "status", "joinedAt", "resolvedAt"
) VALUES
  (
    'p404-r-concurrency-1', 'p404-t1', 'p404-c2', 'p404-c1',
    'p404-referral-concurrency-1', 'p404-subject-concurrency-1',
    'p404-referral-code-concurrency-1', 'qualified',
    '2026-08-06 00:00:00+00', '2026-08-07 00:00:00+00'
  ),
  (
    'p404-r-concurrency-2', 'p404-t1', 'p404-c2', 'p404-c1',
    'p404-referral-concurrency-2', 'p404-subject-concurrency-2',
    'p404-referral-code-concurrency-2', 'qualified',
    '2026-08-06 00:00:00+00', '2026-08-07 00:00:00+00'
  );

INSERT INTO "ReferralRewardIssuance" (
  "id", "tenantId", "referralId", "policySnapshotHash", "issuedAt"
) VALUES
  (
    'p404-i-concurrency-1', 'p404-t1', 'p404-r-concurrency-1',
    'p404-policy-concurrency-1', '2026-08-08 00:00:00+00'
  ),
  (
    'p404-i-concurrency-2', 'p404-t1', 'p404-r-concurrency-2',
    'p404-policy-concurrency-2', '2026-08-08 00:00:00+00'
  );

INSERT INTO "ReferralReward" (
  "id", "tenantId", "issuanceId", "recipientClientId", "rewardSlot",
  "codeHash", "amountKopecks", "currency", "liabilityCapKopecks",
  "liabilityCurrency", "presentationKeyVersion", "issuedAt", "expiresAt"
) VALUES
  (
    'p404-rw-concurrency-1', 'p404-t1', 'p404-i-concurrency-1', 'p404-c1',
    'invitee', 'p404-claim-concurrency-1', 1000, 'RUB', 1000, 'RUB',
    'p4-04-v1', '2026-08-08 00:00:00+00', '2026-10-08 00:00:00+00'
  ),
  (
    'p404-rw-concurrency-2', 'p404-t1', 'p404-i-concurrency-2', 'p404-c1',
    'invitee', 'p404-claim-concurrency-2', 1000, 'RUB', 1000, 'RUB',
    'p4-04-v1', '2026-08-08 00:00:00+00', '2026-10-08 00:00:00+00'
  );

INSERT INTO "Appointment" (
  "id", "tenantId", "mayaClientId", "crmProvider", "crmExternalId",
  "source", "staffExternalId", "serviceIds", "startAt", "endAt",
  "blockedStartAt", "blockedEndAt", "totalPriceKopecks", "currency", "updatedAt"
) VALUES (
  'p404-a-concurrency', 'p404-t1', 'p404-c1', 'yclients',
  'p404-record-concurrency', 'external', 'staff-1', '["service-3"]'::jsonb,
  '2026-09-04 10:00:00+00', '2026-09-04 11:00:00+00',
  '2026-09-04 10:00:00+00', '2026-09-04 11:00:00+00',
  10000, 'RUB', CURRENT_TIMESTAMP
);
