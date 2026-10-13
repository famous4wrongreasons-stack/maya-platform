-- Owner decision 2026-10-13: forbid deleting/replacing a referenced parent
-- within one statement. Preserve guest history, keys, names and update actions.
-- Forward correction only; original migration bytes remain unchanged.
BEGIN;

ALTER TABLE "PublicBookingSession"
  DROP CONSTRAINT "PublicBookingSession_tenantId_fkey",
  ADD CONSTRAINT "PublicBookingSession_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "PublicBookingQuote"
  DROP CONSTRAINT "PublicBookingQuote_sessionId_tenantId_fkey",
  ADD CONSTRAINT "PublicBookingQuote_sessionId_tenantId_fkey"
    FOREIGN KEY ("sessionId", "tenantId") REFERENCES "PublicBookingSession"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "PublicBookingAttempt"
  DROP CONSTRAINT "PublicBookingAttempt_quoteId_sessionId_tenantId_fkey",
  ADD CONSTRAINT "PublicBookingAttempt_quoteId_sessionId_tenantId_fkey"
    FOREIGN KEY ("quoteId", "sessionId", "tenantId") REFERENCES "PublicBookingQuote"("id", "sessionId", "tenantId")
    ON DELETE RESTRICT ON UPDATE NO ACTION;

COMMIT;
