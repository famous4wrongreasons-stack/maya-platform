-- Cycle 06 Package 4 P4-04 contract-to-value schema foundation.
-- Adds only the accepted percentage-policy, frozen reward-liability,
-- restart-safe presentation-version, and exact fulfillment-target facts.
-- Existing rows remain nullable and receive no invented backfill.

ALTER TABLE "ReferralProgram"
  ADD COLUMN "inviterRewardPercentBasisPoints" INTEGER,
  ADD COLUMN "inviteeRewardPercentBasisPoints" INTEGER,
  ADD COLUMN "inviterRewardLiabilityCapKopecks" INTEGER,
  ADD COLUMN "inviteeRewardLiabilityCapKopecks" INTEGER,
  ADD CONSTRAINT "ReferralProgram_inviter_reward_contract_check" CHECK (
    (
      "inviterRewardKopecks" IS NULL
      AND "inviterRewardPercentBasisPoints" IS NULL
      AND "inviterRewardLiabilityCapKopecks" IS NULL
    )
    OR (
      "inviterRewardKopecks" > 0
      AND "inviterRewardPercentBasisPoints" IS NULL
      AND "inviterRewardLiabilityCapKopecks" IS NULL
    )
    OR (
      "inviterRewardKopecks" IS NULL
      AND "inviterRewardPercentBasisPoints" BETWEEN 1 AND 10000
      AND "inviterRewardLiabilityCapKopecks" BETWEEN 1 AND 50000
    )
  ),
  ADD CONSTRAINT "ReferralProgram_invitee_reward_contract_check" CHECK (
    (
      "inviteeRewardKopecks" IS NULL
      AND "inviteeRewardPercentBasisPoints" IS NULL
      AND "inviteeRewardLiabilityCapKopecks" IS NULL
    )
    OR (
      "inviteeRewardKopecks" > 0
      AND "inviteeRewardPercentBasisPoints" IS NULL
      AND "inviteeRewardLiabilityCapKopecks" IS NULL
    )
    OR (
      "inviteeRewardKopecks" IS NULL
      AND "inviteeRewardPercentBasisPoints" BETWEEN 1 AND 10000
      AND "inviteeRewardLiabilityCapKopecks" BETWEEN 1 AND 50000
    )
  );

ALTER TABLE "ReferralReward"
  ADD COLUMN "liabilityCapKopecks" INTEGER,
  ADD COLUMN "liabilityCurrency" TEXT,
  ADD COLUMN "presentationKeyVersion" TEXT,
  ADD CONSTRAINT "ReferralReward_contract_to_value_check" CHECK (
    (
      "liabilityCapKopecks" IS NULL
      AND "liabilityCurrency" IS NULL
      AND "presentationKeyVersion" IS NULL
    )
    OR (
      "liabilityCapKopecks" BETWEEN 1 AND 50000
      AND "liabilityCurrency" ~ '^[A-Z]{3}$'
      AND btrim("presentationKeyVersion") <> ''
      AND (
        (
          "amountKopecks" IS NOT NULL
          AND "liabilityCapKopecks" = "amountKopecks"
          AND "liabilityCurrency" = "currency"
        )
        OR (
          "amountKopecks" IS NULL
          AND "percentBasisPoints" IS NOT NULL
        )
      )
    )
  );

CREATE FUNCTION "require_referral_reward_contract_to_value_on_insert"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."liabilityCapKopecks" IS NULL
    OR NEW."liabilityCurrency" IS NULL
    OR NEW."presentationKeyVersion" IS NULL
  THEN
    RAISE EXCEPTION 'New referral rewards require frozen liability and presentation key version'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ReferralReward_contract_to_value_insert_guard"
BEFORE INSERT ON "ReferralReward"
FOR EACH ROW EXECUTE FUNCTION "require_referral_reward_contract_to_value_on_insert"();

ALTER TABLE "ReferralRewardFulfillment"
  ADD COLUMN "targetAppointmentId" TEXT,
  ADD COLUMN "targetIdentityHash" TEXT,
  ADD COLUMN "eligibleAmountKopecks" INTEGER,
  ADD COLUMN "appliedAmountKopecks" INTEGER,
  ADD COLUMN "currency" TEXT,
  ADD CONSTRAINT "ReferralRewardFulfillment_target_shape_check" CHECK (
    (
      "targetAppointmentId" IS NULL
      AND "targetIdentityHash" IS NULL
      AND "eligibleAmountKopecks" IS NULL
      AND "appliedAmountKopecks" IS NULL
      AND "currency" IS NULL
    )
    OR (
      "targetAppointmentId" IS NOT NULL
      AND btrim("targetIdentityHash") <> ''
      AND "eligibleAmountKopecks" > 0
      AND "appliedAmountKopecks" > 0
      AND "appliedAmountKopecks" <= "eligibleAmountKopecks"
      AND "currency" ~ '^[A-Z]{3}$'
    )
  );

CREATE UNIQUE INDEX "Appointment_id_tenantId_key"
  ON "Appointment"("id", "tenantId");

CREATE UNIQUE INDEX "ReferralRewardFulfillment_tenant_target_hash_key"
  ON "ReferralRewardFulfillment"("tenantId", "targetIdentityHash");

CREATE INDEX "ReferralRewardFulfillment_tenant_target_appointment_idx"
  ON "ReferralRewardFulfillment"("tenantId", "targetAppointmentId");

ALTER TABLE "ReferralRewardFulfillment"
  ADD CONSTRAINT "ReferralRewardFulfillment_target_appointment_tenant_fkey"
  FOREIGN KEY ("targetAppointmentId", "tenantId")
  REFERENCES "Appointment"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "require_referral_reward_fulfillment_contract_to_value"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  reward_row "ReferralReward"%ROWTYPE;
  appointment_row "Appointment"%ROWTYPE;
  expected_applied INTEGER;
BEGIN
  IF NEW."targetAppointmentId" IS NULL
    OR NEW."targetIdentityHash" IS NULL
    OR NEW."eligibleAmountKopecks" IS NULL
    OR NEW."appliedAmountKopecks" IS NULL
    OR NEW."currency" IS NULL
  THEN
    RAISE EXCEPTION 'New referral reward fulfillments require an exact application target and applied value'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO reward_row
  FROM "ReferralReward"
  WHERE "id" = NEW."rewardId"
    AND "tenantId" = NEW."tenantId"
  FOR KEY SHARE;

  IF NOT FOUND
    OR reward_row."liabilityCapKopecks" IS NULL
    OR reward_row."liabilityCurrency" IS NULL
    OR reward_row."presentationKeyVersion" IS NULL
  THEN
    RAISE EXCEPTION 'Referral reward fulfillment requires an exact canonical reward contract'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO appointment_row
  FROM "Appointment"
  WHERE "id" = NEW."targetAppointmentId"
    AND "tenantId" = NEW."tenantId"
  FOR KEY SHARE;

  IF NOT FOUND
    OR appointment_row."mayaClientId" IS NULL
    OR appointment_row."mayaClientId" IS DISTINCT FROM reward_row."recipientClientId"
    OR appointment_row."crmProvider" IS NULL
    OR appointment_row."crmExternalId" IS NULL
  THEN
    RAISE EXCEPTION 'Referral reward fulfillment target tenant, Client, or provider identity does not match'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "UnresolvedClientIdentityHold"
    WHERE "tenantId" = NEW."tenantId"
      AND "provider" = appointment_row."crmProvider"
      AND "externalId" = appointment_row."crmExternalId"
      AND "resolvedAt" IS NULL
  )
  THEN
    RAISE EXCEPTION 'Referral reward fulfillment target Client identity is unresolved'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."fulfilledAt" < reward_row."issuedAt"
    OR NEW."fulfilledAt" >= reward_row."expiresAt"
    OR NEW."currency" IS DISTINCT FROM reward_row."liabilityCurrency"
    OR NEW."appliedAmountKopecks" > reward_row."liabilityCapKopecks"
  THEN
    RAISE EXCEPTION 'Referral reward fulfillment time, currency, or liability exceeds the issued reward'
      USING ERRCODE = '23514';
  END IF;

  IF reward_row."amountKopecks" IS NOT NULL THEN
    expected_applied := LEAST(
      reward_row."amountKopecks",
      NEW."eligibleAmountKopecks"
    );
  ELSE
    expected_applied := LEAST(
      (
        NEW."eligibleAmountKopecks"::BIGINT
        * reward_row."percentBasisPoints"::BIGINT
        / 10000
      )::INTEGER,
      reward_row."liabilityCapKopecks"
    );
  END IF;

  IF expected_applied <= 0
    OR NEW."appliedAmountKopecks" IS DISTINCT FROM expected_applied
  THEN
    RAISE EXCEPTION 'Referral reward fulfillment applied value does not match the frozen reward contract'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ReferralRewardFulfillment_contract_to_value_insert_guard"
BEFORE INSERT ON "ReferralRewardFulfillment"
FOR EACH ROW EXECUTE FUNCTION "require_referral_reward_fulfillment_contract_to_value"();

CREATE OR REPLACE FUNCTION "guard_referral_reward_fulfillment_immutable"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."rewardId" IS DISTINCT FROM OLD."rewardId"
    OR NEW."targetAppointmentId" IS DISTINCT FROM OLD."targetAppointmentId"
    OR NEW."targetIdentityHash" IS DISTINCT FROM OLD."targetIdentityHash"
    OR NEW."eligibleAmountKopecks" IS DISTINCT FROM OLD."eligibleAmountKopecks"
    OR NEW."appliedAmountKopecks" IS DISTINCT FROM OLD."appliedAmountKopecks"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."fulfilledAt" IS DISTINCT FROM OLD."fulfilledAt"
    OR NEW."legacySourceRef" IS DISTINCT FROM OLD."legacySourceRef"
    OR (
      OLD."actionExecutionId" IS NOT NULL
      AND NEW."actionExecutionId" IS DISTINCT FROM OLD."actionExecutionId"
    )
  THEN
    RAISE EXCEPTION 'ReferralRewardFulfillment identity, target, value, and established action binding are immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
