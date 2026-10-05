CREATE OR REPLACE FUNCTION "public_booking_action_binding_v1"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."sourceType" = 'public_booking' AND NOT EXISTS (
    SELECT 1 FROM "PublicBookingAttempt" a
    JOIN "PublicBookingSession" s ON s.id=a."sessionId" AND s."tenantId"=a."tenantId"
    JOIN "PublicBookingQuote" q ON q.id=a."quoteId" AND q."sessionId"=s.id
    WHERE a.id=NEW."sourceRef" AND a."tenantId"=NEW."tenantId"
      AND a."normalizedInputHash"=NEW."normalizedInputHash" AND a."targetRef"=NEW."targetRef"
      AND NOT a."preDispatchFailure" AND s."revokedAt" IS NULL
      AND s."expiresAt"> (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AND q."expiresAt"> (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
  ) THEN RAISE EXCEPTION 'bound public booking intent required'; END IF;
  RETURN NEW;
END $$;
ALTER TABLE "PublicBookingSession" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "PublicBookingQuote" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
ALTER TABLE "PublicBookingAttempt" ALTER COLUMN "createdAt" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
