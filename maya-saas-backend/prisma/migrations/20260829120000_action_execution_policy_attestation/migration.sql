-- Cycle 06 Blocking Package 3 schema-only foundation.
-- Existing ActionExecution rows remain compatible through an all-null rollout
-- tuple. Participating policy contracts must write the complete attestation.

ALTER TABLE "ActionExecution"
  ADD COLUMN "policyContextContract" TEXT,
  ADD COLUMN "policyContextHash" TEXT,
  ADD COLUMN "policyEvidenceJson" JSONB,
  ADD COLUMN "policyEvaluatedAt" TIMESTAMP(3),
  ADD COLUMN "policyValidUntil" TIMESTAMP(3),
  ADD COLUMN "approvalBindingHash" TEXT;

ALTER TABLE "ActionExecution"
  ADD CONSTRAINT "ActionExecution_policy_attestation_shape_check" CHECK (
    (
      "policyContextContract" IS NULL
      AND "policyContextHash" IS NULL
      AND "policyEvidenceJson" IS NULL
      AND "policyEvaluatedAt" IS NULL
      AND "policyValidUntil" IS NULL
      AND "approvalBindingHash" IS NULL
    )
    OR (
      "policyContextContract" IS NOT NULL
      AND btrim("policyContextContract") <> ''
      AND "policyContextHash" IS NOT NULL
      AND btrim("policyContextHash") <> ''
      AND "policyEvidenceJson" IS NOT NULL
      AND jsonb_typeof("policyEvidenceJson") = 'object'
      AND "policyEvaluatedAt" IS NOT NULL
      AND "policyValidUntil" IS NOT NULL
      AND "policyValidUntil" > "policyEvaluatedAt"
      AND "approvalBindingHash" IS NOT NULL
      AND btrim("approvalBindingHash") <> ''
    )
  );
