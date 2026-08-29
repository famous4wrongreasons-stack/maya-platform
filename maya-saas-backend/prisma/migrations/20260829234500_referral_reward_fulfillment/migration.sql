-- Cycle 06 Blocking Package 4 schema-only referral/reward foundation.
-- Referral fact, terminal resolution, reward issuance, reward value rows, and
-- fulfillment remain distinct domain concepts. Legacy rows are not backfilled;
-- safely correlated historical rows may retain null action bindings.

CREATE TABLE "CustomerReferral" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createExecutionId" TEXT,
  "resolutionExecutionId" TEXT,
  "referrerClientId" TEXT NOT NULL,
  "referredClientId" TEXT,
  "identityHash" TEXT NOT NULL,
  "referredSubjectHash" TEXT NOT NULL,
  "referralCodeHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "joinedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "legacySourceRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerReferral_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerReferral_shape_check" CHECK (
    btrim("identityHash") <> ''
    AND btrim("referredSubjectHash") <> ''
    AND btrim("referralCodeHash") <> ''
    AND ("legacySourceRef" IS NULL OR btrim("legacySourceRef") <> '')
    AND "status" IN ('pending', 'qualified', 'expired', 'self_blocked')
    AND (
      (
        "status" = 'pending'
        AND "resolvedAt" IS NULL
        AND "resolutionExecutionId" IS NULL
      )
      OR (
        "status" IN ('qualified', 'expired', 'self_blocked')
        AND "resolvedAt" IS NOT NULL
      )
    )
    AND ("status" <> 'qualified' OR "referredClientId" IS NOT NULL)
  )
);

CREATE TABLE "ReferralRewardIssuance" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "referralId" TEXT NOT NULL,
  "actionExecutionId" TEXT,
  "policySnapshotHash" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "legacySourceRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReferralRewardIssuance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReferralRewardIssuance_shape_check" CHECK (
    btrim("policySnapshotHash") <> ''
    AND ("legacySourceRef" IS NULL OR btrim("legacySourceRef") <> '')
  )
);

CREATE TABLE "ReferralReward" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "issuanceId" TEXT NOT NULL,
  "recipientClientId" TEXT NOT NULL,
  "rewardSlot" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "amountKopecks" INTEGER,
  "currency" TEXT,
  "percentBasisPoints" INTEGER,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReferralReward_value_shape_check" CHECK (
    "rewardSlot" IN ('inviter', 'invitee')
    AND btrim("codeHash") <> ''
    AND "expiresAt" > "issuedAt"
    AND (
      (
        "amountKopecks" > 0
        AND "currency" IS NOT NULL
        AND btrim("currency") <> ''
        AND "percentBasisPoints" IS NULL
      )
      OR (
        "amountKopecks" IS NULL
        AND "currency" IS NULL
        AND "percentBasisPoints" BETWEEN 1 AND 10000
      )
    )
  )
);

CREATE TABLE "ReferralRewardFulfillment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "rewardId" TEXT NOT NULL,
  "actionExecutionId" TEXT,
  "fulfilledAt" TIMESTAMP(3) NOT NULL,
  "legacySourceRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReferralRewardFulfillment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReferralRewardFulfillment_legacy_source_check" CHECK (
    "legacySourceRef" IS NULL OR btrim("legacySourceRef") <> ''
  )
);

CREATE UNIQUE INDEX "CustomerReferral_id_tenantId_key"
  ON "CustomerReferral"("id", "tenantId");
CREATE UNIQUE INDEX "CustomerReferral_tenantId_identityHash_key"
  ON "CustomerReferral"("tenantId", "identityHash");
CREATE UNIQUE INDEX "CustomerReferral_createExecutionId_tenantId_key"
  ON "CustomerReferral"("createExecutionId", "tenantId");
CREATE UNIQUE INDEX "CustomerReferral_resolutionExecutionId_tenantId_key"
  ON "CustomerReferral"("resolutionExecutionId", "tenantId");
CREATE UNIQUE INDEX "CustomerReferral_tenantId_legacySourceRef_key"
  ON "CustomerReferral"("tenantId", "legacySourceRef");
CREATE INDEX "CustomerReferral_tenantId_referredSubjectHash_status_idx"
  ON "CustomerReferral"("tenantId", "referredSubjectHash", "status");
CREATE INDEX "CustomerReferral_tenantId_referrerClientId_joinedAt_idx"
  ON "CustomerReferral"("tenantId", "referrerClientId", "joinedAt");

CREATE UNIQUE INDEX "ReferralRewardIssuance_id_tenantId_key"
  ON "ReferralRewardIssuance"("id", "tenantId");
CREATE UNIQUE INDEX "ReferralRewardIssuance_referralId_tenantId_key"
  ON "ReferralRewardIssuance"("referralId", "tenantId");
CREATE UNIQUE INDEX "ReferralRewardIssuance_actionExecutionId_tenantId_key"
  ON "ReferralRewardIssuance"("actionExecutionId", "tenantId");
CREATE UNIQUE INDEX "ReferralRewardIssuance_tenantId_legacySourceRef_key"
  ON "ReferralRewardIssuance"("tenantId", "legacySourceRef");
CREATE INDEX "ReferralRewardIssuance_tenantId_issuedAt_idx"
  ON "ReferralRewardIssuance"("tenantId", "issuedAt");

CREATE UNIQUE INDEX "ReferralReward_id_tenantId_key"
  ON "ReferralReward"("id", "tenantId");
CREATE UNIQUE INDEX "ReferralReward_tenantId_codeHash_key"
  ON "ReferralReward"("tenantId", "codeHash");
CREATE UNIQUE INDEX "ReferralReward_issuanceId_tenantId_rewardSlot_key"
  ON "ReferralReward"("issuanceId", "tenantId", "rewardSlot");
CREATE INDEX "ReferralReward_tenantId_recipientClientId_expiresAt_idx"
  ON "ReferralReward"("tenantId", "recipientClientId", "expiresAt");

CREATE UNIQUE INDEX "ReferralRewardFulfillment_id_tenantId_key"
  ON "ReferralRewardFulfillment"("id", "tenantId");
CREATE UNIQUE INDEX "ReferralRewardFulfillment_rewardId_tenantId_key"
  ON "ReferralRewardFulfillment"("rewardId", "tenantId");
CREATE UNIQUE INDEX "ReferralRewardFulfillment_actionExecutionId_tenantId_key"
  ON "ReferralRewardFulfillment"("actionExecutionId", "tenantId");
CREATE UNIQUE INDEX "ReferralRewardFulfillment_tenantId_legacySourceRef_key"
  ON "ReferralRewardFulfillment"("tenantId", "legacySourceRef");
CREATE INDEX "ReferralRewardFulfillment_tenantId_fulfilledAt_idx"
  ON "ReferralRewardFulfillment"("tenantId", "fulfilledAt");

ALTER TABLE "CustomerReferral"
  ADD CONSTRAINT "CustomerReferral_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerReferral_referrerClientId_tenantId_fkey"
  FOREIGN KEY ("referrerClientId", "tenantId")
  REFERENCES "Client"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "CustomerReferral_referredClientId_tenantId_fkey"
  FOREIGN KEY ("referredClientId", "tenantId")
  REFERENCES "Client"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "CustomerReferral_createExecutionId_tenantId_fkey"
  FOREIGN KEY ("createExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "CustomerReferral_resolutionExecutionId_tenantId_fkey"
  FOREIGN KEY ("resolutionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ReferralRewardIssuance"
  ADD CONSTRAINT "ReferralRewardIssuance_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ReferralRewardIssuance_referralId_tenantId_fkey"
  FOREIGN KEY ("referralId", "tenantId")
  REFERENCES "CustomerReferral"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "ReferralRewardIssuance_actionExecutionId_tenantId_fkey"
  FOREIGN KEY ("actionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ReferralReward"
  ADD CONSTRAINT "ReferralReward_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ReferralReward_issuanceId_tenantId_fkey"
  FOREIGN KEY ("issuanceId", "tenantId")
  REFERENCES "ReferralRewardIssuance"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "ReferralReward_recipientClientId_tenantId_fkey"
  FOREIGN KEY ("recipientClientId", "tenantId")
  REFERENCES "Client"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ReferralRewardFulfillment"
  ADD CONSTRAINT "ReferralRewardFulfillment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ReferralRewardFulfillment_rewardId_tenantId_fkey"
  FOREIGN KEY ("rewardId", "tenantId")
  REFERENCES "ReferralReward"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "ReferralRewardFulfillment_actionExecutionId_tenantId_fkey"
  FOREIGN KEY ("actionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "require_qualified_referral_for_reward_issuance"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "CustomerReferral"
    WHERE "id" = NEW."referralId"
      AND "tenantId" = NEW."tenantId"
      AND "status" = 'qualified'
  )
  THEN
    RAISE EXCEPTION 'ReferralRewardIssuance requires a qualified referral'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ReferralRewardIssuance_qualification_guard"
BEFORE INSERT ON "ReferralRewardIssuance"
FOR EACH ROW EXECUTE FUNCTION "require_qualified_referral_for_reward_issuance"();

CREATE FUNCTION "guard_customer_referral_binding_and_resolution"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."referrerClientId" IS DISTINCT FROM OLD."referrerClientId"
    OR NEW."identityHash" IS DISTINCT FROM OLD."identityHash"
    OR NEW."referredSubjectHash" IS DISTINCT FROM OLD."referredSubjectHash"
    OR NEW."referralCodeHash" IS DISTINCT FROM OLD."referralCodeHash"
    OR NEW."joinedAt" IS DISTINCT FROM OLD."joinedAt"
    OR NEW."legacySourceRef" IS DISTINCT FROM OLD."legacySourceRef"
    OR (
      OLD."createExecutionId" IS NOT NULL
      AND NEW."createExecutionId" IS DISTINCT FROM OLD."createExecutionId"
    )
    OR (
      OLD."referredClientId" IS NOT NULL
      AND NEW."referredClientId" IS DISTINCT FROM OLD."referredClientId"
    )
    OR (
      OLD."resolutionExecutionId" IS NOT NULL
      AND NEW."resolutionExecutionId" IS DISTINCT FROM OLD."resolutionExecutionId"
    )
    OR (
      OLD."status" <> 'pending'
      AND (
        NEW."status" IS DISTINCT FROM OLD."status"
        OR NEW."resolvedAt" IS DISTINCT FROM OLD."resolvedAt"
        OR NEW."resolutionExecutionId" IS DISTINCT FROM OLD."resolutionExecutionId"
      )
    )
  THEN
    RAISE EXCEPTION 'CustomerReferral identity and established action bindings are immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "CustomerReferral_binding_and_resolution_guard"
BEFORE UPDATE ON "CustomerReferral"
FOR EACH ROW EXECUTE FUNCTION "guard_customer_referral_binding_and_resolution"();

CREATE FUNCTION "guard_referral_reward_issuance_immutable"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."referralId" IS DISTINCT FROM OLD."referralId"
    OR NEW."policySnapshotHash" IS DISTINCT FROM OLD."policySnapshotHash"
    OR NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt"
    OR NEW."legacySourceRef" IS DISTINCT FROM OLD."legacySourceRef"
    OR (
      OLD."actionExecutionId" IS NOT NULL
      AND NEW."actionExecutionId" IS DISTINCT FROM OLD."actionExecutionId"
    )
  THEN
    RAISE EXCEPTION 'ReferralRewardIssuance identity, policy, and established action binding are immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ReferralRewardIssuance_immutable_guard"
BEFORE UPDATE ON "ReferralRewardIssuance"
FOR EACH ROW EXECUTE FUNCTION "guard_referral_reward_issuance_immutable"();

CREATE FUNCTION "reject_referral_reward_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'ReferralReward value rows are immutable'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "ReferralReward_immutable_guard"
BEFORE UPDATE ON "ReferralReward"
FOR EACH ROW EXECUTE FUNCTION "reject_referral_reward_update"();

CREATE FUNCTION "guard_referral_reward_fulfillment_immutable"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."rewardId" IS DISTINCT FROM OLD."rewardId"
    OR NEW."fulfilledAt" IS DISTINCT FROM OLD."fulfilledAt"
    OR NEW."legacySourceRef" IS DISTINCT FROM OLD."legacySourceRef"
    OR (
      OLD."actionExecutionId" IS NOT NULL
      AND NEW."actionExecutionId" IS DISTINCT FROM OLD."actionExecutionId"
    )
  THEN
    RAISE EXCEPTION 'ReferralRewardFulfillment identity and established action binding are immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ReferralRewardFulfillment_immutable_guard"
BEFORE UPDATE ON "ReferralRewardFulfillment"
FOR EACH ROW EXECUTE FUNCTION "guard_referral_reward_fulfillment_immutable"();
