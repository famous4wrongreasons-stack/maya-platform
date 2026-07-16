-- Add global retention-scan indexes for authentication security records.
BEGIN;

CREATE INDEX "AuthFlowState_expiresAt_idx"
ON "AuthFlowState"("expiresAt");

CREATE INDEX "AuthFlowState_consumedAt_idx"
ON "AuthFlowState"("consumedAt");

CREATE INDEX "PhoneAuthCode_expiresAt_idx"
ON "PhoneAuthCode"("expiresAt");

CREATE INDEX "PhoneAuthCode_consumedAt_idx"
ON "PhoneAuthCode"("consumedAt");

CREATE INDEX "AuthSession_revokedAt_idx"
ON "AuthSession"("revokedAt");

COMMIT;
