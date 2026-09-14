-- B9 V1: canonical matcher proves the bounded, ordered eligible set before a
-- lifecycle mutation. Ineligible earlier rows remain active and cannot block
-- the earliest eligible Client delivery.
CREATE OR REPLACE FUNCTION "guard_client_wanted_slot_update"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE eligible_ids TEXT;
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
    OR NEW."branchId" IS DISTINCT FROM OLD."branchId"
    OR NEW."staffId" IS DISTINCT FROM OLD."staffId"
    OR NEW."desiredStartAt" IS DISTINCT FROM OLD."desiredStartAt"
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR NEW."matchToleranceMinutes" IS DISTINCT FROM OLD."matchToleranceMinutes"
    OR NEW."createdByActionExecutionId" IS DISTINCT FROM OLD."createdByActionExecutionId"
    OR NEW."sourceChannelLinkId" IS DISTINCT FROM OLD."sourceChannelLinkId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Wanted slot historical request facts are immutable';
  END IF;
  IF OLD."status" <> NEW."status" AND NOT (
    (OLD."status" = 'ACTIVE' AND NEW."status" IN ('MATCHED', 'CANCELLED', 'EXPIRED'))
    OR (OLD."status" = 'MATCHED' AND NEW."status" IN ('NOTIFIED', 'CANCELLED'))
  ) THEN RAISE EXCEPTION 'Invalid wanted slot lifecycle transition'; END IF;
  IF OLD."matchedSourceEventId" IS NOT NULL AND NEW."matchedSourceEventId" IS DISTINCT FROM OLD."matchedSourceEventId" THEN
    RAISE EXCEPTION 'Wanted slot match source is immutable';
  END IF;
  IF OLD."matchedAt" IS NOT NULL AND NEW."matchedAt" IS DISTINCT FROM OLD."matchedAt" THEN
    RAISE EXCEPTION 'Wanted slot match time is immutable';
  END IF;
  IF OLD."notifiedAt" IS NOT NULL AND NEW."notifiedAt" IS DISTINCT FROM OLD."notifiedAt" THEN
    RAISE EXCEPTION 'Wanted slot notification time is immutable';
  END IF;
  IF OLD."terminalAt" IS NOT NULL AND NEW."terminalAt" IS DISTINCT FROM OLD."terminalAt" THEN
    RAISE EXCEPTION 'Wanted slot terminal time is immutable';
  END IF;
  IF NEW."status" = 'EXPIRED' AND timezone('UTC'::text, CURRENT_TIMESTAMP) < NEW."expiresAt" THEN
    RAISE EXCEPTION 'Wanted slot cannot expire before requested start';
  END IF;
  IF NEW."status" = 'MATCHED' AND OLD."status" = 'ACTIVE' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW."tenantId" || ':wanted-slot-event:' || NEW."matchedSourceEventId", 0));
    eligible_ids := current_setting('maya.client_wanted_slot_eligible_ids', true);
    IF eligible_ids IS NULL
      OR NOT (',' || eligible_ids || ',' LIKE '%,' || NEW."id" || ',%')
      OR array_length(string_to_array(eligible_ids, ','), 1) > 3 THEN
      RAISE EXCEPTION 'Wanted slot match requires canonical eligible ordering';
    END IF;
    IF EXISTS (
      SELECT 1 FROM "ClientWantedSlotInterest" earlier
      WHERE earlier."tenantId" = NEW."tenantId"
        AND earlier."branchId" = NEW."branchId"
        AND earlier."staffId" = NEW."staffId"
        AND earlier."desiredStartAt" = NEW."desiredStartAt"
        AND earlier."status" = 'ACTIVE'
        AND (earlier."createdAt", earlier."id") < (NEW."createdAt", NEW."id")
        AND ',' || eligible_ids || ',' LIKE '%,' || earlier."id" || ',%'
    ) THEN RAISE EXCEPTION 'Wanted slot matching must use earliest eligible ordering'; END IF;
    IF (SELECT count(*) FROM "ClientWantedSlotInterest" matched
        WHERE matched."tenantId" = NEW."tenantId"
          AND matched."matchedSourceEventId" = NEW."matchedSourceEventId") >= 3 THEN
      RAISE EXCEPTION 'WANTED_SLOT_MATCH_FAN_OUT_EXCEEDED';
    END IF;
  END IF;
  RETURN NEW;
END $$;
