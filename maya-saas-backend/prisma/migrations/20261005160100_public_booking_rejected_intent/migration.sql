-- A proved pre-dispatch refusal releases only the intent guard, never its nonce receipt.
ALTER TABLE "PublicBookingAttempt" DROP CONSTRAINT "PublicBookingAttempt_sessionId_intentHash_key";
CREATE UNIQUE INDEX "PublicBookingAttempt_active_intent" ON "PublicBookingAttempt"("sessionId", "intentHash") WHERE NOT "preDispatchFailure";
CREATE INDEX "PublicBookingAttempt_intent_lookup" ON "PublicBookingAttempt"("sessionId", "intentHash");
