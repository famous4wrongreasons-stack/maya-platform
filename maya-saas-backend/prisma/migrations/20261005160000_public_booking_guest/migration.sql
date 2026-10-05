-- Additive guest booking context; no User or Client authority is created.
CREATE TABLE "PublicBookingSession" (
  id TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "Tenant"(id),
  "siteKey" TEXT NOT NULL, "configHash" TEXT NOT NULL, "secretHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(id, "tenantId")
);
CREATE TABLE "PublicBookingQuote" (
  id TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "sessionId" TEXT NOT NULL,
  "snapshotJson" JSONB NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(id, "sessionId", "tenantId"),
  FOREIGN KEY ("sessionId", "tenantId") REFERENCES "PublicBookingSession"(id, "tenantId")
);
CREATE TABLE "PublicBookingAttempt" (
  id TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "quoteId" TEXT NOT NULL,
  nonce TEXT NOT NULL, "requestHash" TEXT NOT NULL, "intentHash" TEXT NOT NULL,
  "normalizedInputHash" TEXT NOT NULL, "targetRef" TEXT NOT NULL,
  "preDispatchFailure" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("sessionId", nonce), UNIQUE("sessionId", "intentHash"),
  FOREIGN KEY ("quoteId", "sessionId", "tenantId") REFERENCES "PublicBookingQuote"(id, "sessionId", "tenantId")
);
CREATE INDEX "PublicBookingSession_expiry" ON "PublicBookingSession"("expiresAt");
CREATE FUNCTION "public_booking_immutable_v1"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'PublicBookingAttempt' THEN
    IF (to_jsonb(OLD) - 'preDispatchFailure') IS DISTINCT FROM (to_jsonb(NEW) - 'preDispatchFailure')
      OR OLD."preDispatchFailure" THEN RAISE EXCEPTION 'immutable public booking attempt'; END IF;
  ELSIF TG_TABLE_NAME = 'PublicBookingSession' THEN
    IF (to_jsonb(OLD) - 'revokedAt') IS DISTINCT FROM (to_jsonb(NEW) - 'revokedAt')
      OR OLD."revokedAt" IS NOT NULL THEN RAISE EXCEPTION 'immutable public booking session'; END IF;
  ELSE RAISE EXCEPTION 'immutable public booking quote'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "PublicBookingSession_immutable" BEFORE UPDATE ON "PublicBookingSession" FOR EACH ROW EXECUTE FUNCTION "public_booking_immutable_v1"();
CREATE TRIGGER "PublicBookingQuote_immutable" BEFORE UPDATE ON "PublicBookingQuote" FOR EACH ROW EXECUTE FUNCTION "public_booking_immutable_v1"();
CREATE TRIGGER "PublicBookingAttempt_immutable" BEFORE UPDATE ON "PublicBookingAttempt" FOR EACH ROW EXECUTE FUNCTION "public_booking_immutable_v1"();
