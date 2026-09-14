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
  ('p404-t1', 'P4-04 Tenant 1', 'p404-t1', CURRENT_TIMESTAMP),
  ('p404-t2', 'P4-04 Tenant 2', 'p404-t2', CURRENT_TIMESTAMP),
  ('p404-t3', 'P4-04 Tenant 3', 'p404-t3', CURRENT_TIMESTAMP);

INSERT INTO "Client" ("id", "tenantId", "updatedAt") VALUES
  ('p404-c1', 'p404-t1', CURRENT_TIMESTAMP),
  ('p404-c2', 'p404-t1', CURRENT_TIMESTAMP),
  ('p404-c3', 'p404-t2', CURRENT_TIMESTAMP);

INSERT INTO "ReferralProgram" (
  "id", "tenantId", "enabled", "inviterRewardKopecks", "currency", "updatedAt"
) VALUES ('p404-program-money', 'p404-t1', true, 1000, 'RUB', CURRENT_TIMESTAMP);

INSERT INTO "ReferralProgram" (
  "id", "tenantId", "enabled", "inviterRewardPercentBasisPoints",
  "inviterRewardLiabilityCapKopecks", "currency", "updatedAt"
) VALUES ('p404-program-percent', 'p404-t2', true, 1500, 5000, 'RUB', CURRENT_TIMESTAMP);

SELECT pg_temp.expect_constraint_failure(
  'money and percentage policy cannot coexist',
  $statement$
    INSERT INTO "ReferralProgram" (
      "id", "tenantId", "enabled", "inviterRewardKopecks",
      "inviterRewardPercentBasisPoints", "inviterRewardLiabilityCapKopecks", "updatedAt"
    ) VALUES ('p404-program-invalid', 'p404-t3', true, 1000, 1500, 5000, CURRENT_TIMESTAMP)
  $statement$
);

INSERT INTO "Appointment" (
  "id", "tenantId", "mayaClientId", "crmProvider", "crmExternalId",
  "source", "staffExternalId", "serviceIds", "startAt", "endAt",
  "blockedStartAt", "blockedEndAt", "totalPriceKopecks", "currency", "updatedAt"
) VALUES
  (
    'p404-a1', 'p404-t1', 'p404-c1', 'yclients', 'p404-record-1',
    'external', 'staff-1', '["service-1"]'::jsonb,
    '2026-09-01 10:00:00+00', '2026-09-01 11:00:00+00',
    '2026-09-01 10:00:00+00', '2026-09-01 11:00:00+00', 10000, 'RUB', CURRENT_TIMESTAMP
  ),
  (
    'p404-a2', 'p404-t1', 'p404-c2', 'yclients', 'p404-record-2',
    'external', 'staff-1', '["service-1"]'::jsonb,
    '2026-09-01 12:00:00+00', '2026-09-01 13:00:00+00',
    '2026-09-01 12:00:00+00', '2026-09-01 13:00:00+00', 10000, 'RUB', CURRENT_TIMESTAMP
  ),
  (
    'p404-a3', 'p404-t2', 'p404-c3', 'yclients', 'p404-record-3',
    'external', 'staff-2', '["service-1"]'::jsonb,
    '2026-09-01 14:00:00+00', '2026-09-01 15:00:00+00',
    '2026-09-01 14:00:00+00', '2026-09-01 15:00:00+00', 10000, 'RUB', CURRENT_TIMESTAMP
  ),
  (
    'p404-a-hold', 'p404-t1', 'p404-c1', 'yclients', 'p404-record-hold',
    'external', 'staff-1', '["service-1"]'::jsonb,
    '2026-09-01 16:00:00+00', '2026-09-01 17:00:00+00',
    '2026-09-01 16:00:00+00', '2026-09-01 17:00:00+00', 10000, 'RUB', CURRENT_TIMESTAMP
  );

INSERT INTO "UnresolvedClientIdentityHold" (
  "id", "tenantId", "provider", "externalId", "reasonCode",
  "sourceNamespace", "sourceEvidenceHash", "unresolvedPrincipalCount"
) VALUES (
  'p404-hold', 'p404-t1', 'yclients', 'p404-record-hold',
  'loyalty_identity_unresolved', 'p4-04-proof', repeat('a', 64), 2
);

INSERT INTO "CustomerReferral" (
  "id", "tenantId", "referrerClientId", "referredClientId", "identityHash",
  "referredSubjectHash", "referralCodeHash", "status", "joinedAt", "resolvedAt"
) VALUES
  (
    'p404-r1', 'p404-t1', 'p404-c2', 'p404-c1', 'p404-referral-1',
    'p404-subject-1', 'p404-referral-code-1', 'qualified',
    '2026-08-01 00:00:00+00', '2026-08-02 00:00:00+00'
  ),
  (
    'p404-r2', 'p404-t1', 'p404-c2', 'p404-c1', 'p404-referral-2',
    'p404-subject-2', 'p404-referral-code-2', 'qualified',
    '2026-08-03 00:00:00+00', '2026-08-04 00:00:00+00'
  );

INSERT INTO "ReferralRewardIssuance" (
  "id", "tenantId", "referralId", "policySnapshotHash", "issuedAt"
) VALUES
  ('p404-i1', 'p404-t1', 'p404-r1', 'p404-policy-money', '2026-08-05 00:00:00+00'),
  ('p404-i2', 'p404-t1', 'p404-r2', 'p404-policy-percent', '2026-08-05 00:00:00+00');

SELECT pg_temp.expect_constraint_failure(
  'restart cannot create a second issuance for one referral',
  $statement$
    INSERT INTO "ReferralRewardIssuance" (
      "id", "tenantId", "referralId", "policySnapshotHash", "issuedAt"
    ) VALUES (
      'p404-i1-duplicate', 'p404-t1', 'p404-r1', 'p404-policy-money',
      '2026-08-05 00:00:00+00'
    )
  $statement$
);

INSERT INTO "ReferralReward" (
  "id", "tenantId", "issuanceId", "recipientClientId", "rewardSlot",
  "codeHash", "amountKopecks", "currency", "liabilityCapKopecks",
  "liabilityCurrency", "presentationKeyVersion", "issuedAt", "expiresAt"
) VALUES (
  'p404-rw-money', 'p404-t1', 'p404-i1', 'p404-c1', 'invitee',
  'p404-claim-money', 1000, 'RUB', 1000, 'RUB', 'p4-04-v1',
  '2026-08-05 00:00:00+00', '2026-10-05 00:00:00+00'
);

INSERT INTO "ReferralReward" (
  "id", "tenantId", "issuanceId", "recipientClientId", "rewardSlot",
  "codeHash", "percentBasisPoints", "liabilityCapKopecks",
  "liabilityCurrency", "presentationKeyVersion", "issuedAt", "expiresAt"
) VALUES (
  'p404-rw-percent', 'p404-t1', 'p404-i2', 'p404-c1', 'invitee',
  'p404-claim-percent', 1500, 5000, 'RUB', 'p4-04-v1',
  '2026-08-05 00:00:00+00', '2026-10-05 00:00:00+00'
);

SELECT pg_temp.expect_constraint_failure(
  'new reward cannot omit frozen presentation and liability facts',
  $statement$
    INSERT INTO "ReferralReward" (
      "id", "tenantId", "issuanceId", "recipientClientId", "rewardSlot",
      "codeHash", "amountKopecks", "currency", "issuedAt", "expiresAt"
    ) VALUES (
      'p404-rw-incomplete', 'p404-t1', 'p404-i1', 'p404-c1', 'inviter',
      'p404-claim-incomplete', 1000, 'RUB',
      '2026-08-05 00:00:00+00', '2026-10-05 00:00:00+00'
    )
  $statement$
);

SELECT pg_temp.expect_constraint_failure(
  'reward recipient cannot cross tenants',
  $statement$
    INSERT INTO "ReferralReward" (
      "id", "tenantId", "issuanceId", "recipientClientId", "rewardSlot",
      "codeHash", "amountKopecks", "currency", "liabilityCapKopecks",
      "liabilityCurrency", "presentationKeyVersion", "issuedAt", "expiresAt"
    ) VALUES (
      'p404-rw-cross-tenant', 'p404-t1', 'p404-i1', 'p404-c3', 'inviter',
      'p404-claim-cross-tenant', 1000, 'RUB', 1000, 'RUB', 'p4-04-v1',
      '2026-08-05 00:00:00+00', '2026-10-05 00:00:00+00'
    )
  $statement$
);

SELECT pg_temp.expect_constraint_failure(
  'issued reward value is immutable',
  $statement$
    UPDATE "ReferralReward"
    SET "amountKopecks" = 999
    WHERE "id" = 'p404-rw-money'
  $statement$
);

SELECT pg_temp.expect_constraint_failure(
  'presentation version is immutable',
  $statement$
    UPDATE "ReferralReward"
    SET "presentationKeyVersion" = 'p4-04-v2'
    WHERE "id" = 'p404-rw-money'
  $statement$
);

UPDATE "ReferralProgram"
SET "inviterRewardKopecks" = 2000
WHERE "id" = 'p404-program-money';

DO $$
BEGIN
  IF (SELECT "amountKopecks" FROM "ReferralReward" WHERE "id" = 'p404-rw-money') <> 1000 THEN
    RAISE EXCEPTION 'Policy update changed an already issued reward';
  END IF;
END;
$$;

SELECT pg_temp.expect_constraint_failure(
  'wrong recipient target fails closed',
  $statement$
    INSERT INTO "ReferralRewardFulfillment" (
      "id", "tenantId", "rewardId", "targetAppointmentId",
      "targetIdentityHash", "eligibleAmountKopecks", "appliedAmountKopecks",
      "currency", "fulfilledAt"
    ) VALUES (
      'p404-f-wrong-client', 'p404-t1', 'p404-rw-money', 'p404-a2',
      'p404-target-wrong-client', 10000, 1000, 'RUB', '2026-09-02 00:00:00+00'
    )
  $statement$
);

SELECT pg_temp.expect_constraint_failure(
  'cross-tenant target fails closed',
  $statement$
    INSERT INTO "ReferralRewardFulfillment" (
      "id", "tenantId", "rewardId", "targetAppointmentId",
      "targetIdentityHash", "eligibleAmountKopecks", "appliedAmountKopecks",
      "currency", "fulfilledAt"
    ) VALUES (
      'p404-f-cross-tenant', 'p404-t1', 'p404-rw-money', 'p404-a3',
      'p404-target-cross-tenant', 10000, 1000, 'RUB', '2026-09-02 00:00:00+00'
    )
  $statement$
);

SELECT pg_temp.expect_constraint_failure(
  'unresolved target identity fails closed',
  $statement$
    INSERT INTO "ReferralRewardFulfillment" (
      "id", "tenantId", "rewardId", "targetAppointmentId",
      "targetIdentityHash", "eligibleAmountKopecks", "appliedAmountKopecks",
      "currency", "fulfilledAt"
    ) VALUES (
      'p404-f-hold', 'p404-t1', 'p404-rw-money', 'p404-a-hold',
      'p404-target-hold', 10000, 1000, 'RUB', '2026-09-02 00:00:00+00'
    )
  $statement$
);

SELECT pg_temp.expect_constraint_failure(
  'applied value must match frozen fixed-money reward',
  $statement$
    INSERT INTO "ReferralRewardFulfillment" (
      "id", "tenantId", "rewardId", "targetAppointmentId",
      "targetIdentityHash", "eligibleAmountKopecks", "appliedAmountKopecks",
      "currency", "fulfilledAt"
    ) VALUES (
      'p404-f-wrong-value', 'p404-t1', 'p404-rw-money', 'p404-a1',
      'p404-target-wrong-value', 10000, 999, 'RUB', '2026-09-02 00:00:00+00'
    )
  $statement$
);

INSERT INTO "ReferralRewardFulfillment" (
  "id", "tenantId", "rewardId", "targetAppointmentId",
  "targetIdentityHash", "eligibleAmountKopecks", "appliedAmountKopecks",
  "currency", "fulfilledAt"
) VALUES (
  'p404-f-money', 'p404-t1', 'p404-rw-money', 'p404-a1',
  'p404-target-money', 10000, 1000, 'RUB', '2026-09-02 00:00:00+00'
);

SELECT pg_temp.expect_constraint_failure(
  'fulfillment target cannot be replaced',
  $statement$
    UPDATE "ReferralRewardFulfillment"
    SET "targetIdentityHash" = 'p404-target-replaced'
    WHERE "id" = 'p404-f-money'
  $statement$
);

SELECT pg_temp.expect_constraint_failure(
  'one exact target cannot receive a second referral reward',
  $statement$
    INSERT INTO "ReferralRewardFulfillment" (
      "id", "tenantId", "rewardId", "targetAppointmentId",
      "targetIdentityHash", "eligibleAmountKopecks", "appliedAmountKopecks",
      "currency", "fulfilledAt"
    ) VALUES (
      'p404-f-target-duplicate', 'p404-t1', 'p404-rw-percent', 'p404-a1',
      'p404-target-money', 10000, 1500, 'RUB', '2026-09-02 00:00:00+00'
    )
  $statement$
);

INSERT INTO "Appointment" (
  "id", "tenantId", "mayaClientId", "crmProvider", "crmExternalId",
  "source", "staffExternalId", "serviceIds", "startAt", "endAt",
  "blockedStartAt", "blockedEndAt", "totalPriceKopecks", "currency", "updatedAt"
) VALUES (
  'p404-a4', 'p404-t1', 'p404-c1', 'yclients', 'p404-record-4',
  'external', 'staff-1', '["service-2"]'::jsonb,
  '2026-09-02 10:00:00+00', '2026-09-02 11:00:00+00',
  '2026-09-02 10:00:00+00', '2026-09-02 11:00:00+00', 10000, 'RUB', CURRENT_TIMESTAMP
);

INSERT INTO "ReferralRewardFulfillment" (
  "id", "tenantId", "rewardId", "targetAppointmentId",
  "targetIdentityHash", "eligibleAmountKopecks", "appliedAmountKopecks",
  "currency", "fulfilledAt"
) VALUES (
  'p404-f-percent', 'p404-t1', 'p404-rw-percent', 'p404-a4',
  'p404-target-percent', 10000, 1500, 'RUB', '2026-09-03 00:00:00+00'
);

DO $$
BEGIN
  IF (SELECT count(*) FROM "ReferralReward") <> 2 THEN
    RAISE EXCEPTION 'Unexpected reward row count';
  END IF;
  IF (SELECT count(*) FROM "ReferralRewardFulfillment") <> 2 THEN
    RAISE EXCEPTION 'Unexpected fulfillment row count';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "ReferralRewardFulfillment"
    WHERE "appliedAmountKopecks" > "eligibleAmountKopecks"
  ) THEN
    RAISE EXCEPTION 'Applied value exceeds exact target value';
  END IF;
END;
$$;

INSERT INTO "ActionExecution" (
  "id", "tenantId", "identityVersion", "identityFingerprint",
  "idempotencyScope", "requestIdempotencyKeyHash", "sourceType", "sourceRef",
  "actionClass", "capability", "capabilityVersion", "targetKind", "targetRef",
  "normalizedInputContract", "normalizedInputHash", "normalizedInputEncrypted",
  "evidenceRefsJson", "dryRun", "riskProfileVersion", "riskFacetsJson",
  "policyKey", "policyVersion", "policyDecision", "autonomyLevel",
  "policyDecidedBy", "policyContextContract", "policyContextHash",
  "policyEvidenceJson", "policyEvaluatedAt", "policyValidUntil",
  "approvalRequirement", "approvalDecision", "approvalInputHash",
  "approvalBindingHash", "approvalRequestedAt", "approvalExpiresAt",
  "state", "retryPolicyKey", "retryPolicyVersion", "maxExecutionAttempts",
  "reconciliationPolicyKey", "reconciliationPolicyVersion",
  "reconciliationState", "transportIdentityVersion",
  "transportIdempotencyKey", "updatedAt"
) VALUES (
  'p404-envelope-1', 'p404-t1', 1, 'p404-envelope-fingerprint-1',
  'p4-04:referral-envelope', 'p404-envelope-idempotency-1',
  'scheduler', 'p404-scheduler-window-1',
  'p4-04.referral_reward_batch', 'referral_reward_batch', 1,
  'tenant_referral_batch', 'p404-t1:rub:window-1',
  'p4-04.referral-batch-envelope.v1', 'p404-envelope-input-hash-1',
  'encrypted:exact-bounded-audience-and-caps',
  '[{"ref":"p404-safe-candidate-set-hash"}]'::jsonb, true, 1,
  '[{"maxReferrals":25,"maxRecipients":50,"maxAggregateKopecks":2500000,"currency":"RUB"}]'::jsonb,
  'p4-04.referral-batch-policy', 1, 'ALLOW', 'L3', 'canonical_ingress',
  'p4-04.referral-batch-policy-context.v1', 'p404-policy-context-hash-1',
  '{"tenant":"p404-t1","currency":"RUB","maxAggregateKopecks":2500000}'::jsonb,
  '2026-09-01 00:00:00+00', '2026-09-01 00:15:00+00',
  'REQUIRED', 'PENDING', 'p404-envelope-input-hash-1',
  'p404-envelope-approval-binding-1',
  '2026-09-01 00:00:00+00', '2026-09-01 00:15:00+00',
  'PENDING_APPROVAL', 'no-blind-retry', 1, 1,
  'local-batch-resume', 1, 'NOT_REQUIRED', 1,
  'p404-envelope-transport-1', CURRENT_TIMESTAMP
);

SELECT pg_temp.expect_constraint_failure(
  'batch restart cannot create additional value capacity',
  $statement$
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
    ) VALUES (
      'p404-envelope-duplicate', 'p404-t1', 1, 'p404-envelope-fingerprint-1',
      'scheduler', 'p4-04.referral_reward_batch', 'referral_reward_batch', 1,
      'tenant_referral_batch', 'p404-t1:rub:window-1',
      'p4-04.referral-batch-envelope.v1', 'p404-envelope-input-hash-1',
      '[]'::jsonb, true, 1, '[]'::jsonb, 'p4-04.referral-batch-policy', 1,
      'ALLOW', 'L3', 'canonical_ingress', 'NONE', 'NOT_REQUIRED', 'READY',
      'no-blind-retry', 1, 1, 'local-batch-resume', 1, 'NOT_REQUIRED', 1,
      'p404-envelope-transport-duplicate', CURRENT_TIMESTAMP
    )
  $statement$
);

DO $$
DECLARE
  facets JSONB;
BEGIN
  SELECT "riskFacetsJson" INTO facets
  FROM "ActionExecution"
  WHERE "id" = 'p404-envelope-1';

  IF facets #>> '{0,maxReferrals}' <> '25'
    OR facets #>> '{0,maxRecipients}' <> '50'
    OR facets #>> '{0,maxAggregateKopecks}' <> '2500000'
  THEN
    RAISE EXCEPTION 'Batch envelope caps are not durably bound';
  END IF;
END;
$$;

SELECT 'P4-04 contract-to-value structural proof: PASS' AS result;
