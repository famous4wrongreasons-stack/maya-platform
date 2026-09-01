\set ON_ERROR_STOP on

DO $$
BEGIN
  IF (SELECT count(*) FROM "ReferralProgram" WHERE "id" = 'p404-historical-program') <> 1 THEN
    RAISE EXCEPTION 'Historical ReferralProgram was not preserved';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ReferralProgram"
    WHERE "id" = 'p404-historical-program'
      AND (
        "inviterRewardPercentBasisPoints" IS NOT NULL
        OR "inviteeRewardPercentBasisPoints" IS NOT NULL
        OR "inviterRewardLiabilityCapKopecks" IS NOT NULL
        OR "inviteeRewardLiabilityCapKopecks" IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'Historical ReferralProgram received invented policy facts';
  END IF;

  IF (SELECT count(*) FROM "ReferralReward" WHERE "id" = 'p404-historical-reward') <> 1 THEN
    RAISE EXCEPTION 'Historical ReferralReward was not preserved';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ReferralReward"
    WHERE "id" = 'p404-historical-reward'
      AND (
        "liabilityCapKopecks" IS NOT NULL
        OR "liabilityCurrency" IS NOT NULL
        OR "presentationKeyVersion" IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'Historical ReferralReward received invented contract facts';
  END IF;

  IF (SELECT count(*) FROM "ReferralRewardFulfillment" WHERE "id" = 'p404-historical-fulfillment') <> 1 THEN
    RAISE EXCEPTION 'Historical ReferralRewardFulfillment was not preserved';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ReferralRewardFulfillment"
    WHERE "id" = 'p404-historical-fulfillment'
      AND (
        "targetAppointmentId" IS NOT NULL
        OR "targetIdentityHash" IS NOT NULL
        OR "eligibleAmountKopecks" IS NOT NULL
        OR "appliedAmountKopecks" IS NOT NULL
        OR "currency" IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'Historical fulfillment received an invented target or value';
  END IF;
END;
$$;

SELECT 'P4-04 historical compatibility after migration: PASS' AS result;
