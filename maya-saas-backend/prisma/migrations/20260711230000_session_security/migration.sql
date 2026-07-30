-- Add revocable sessions and one-time refresh-token history.
BEGIN;

CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT NOT NULL,
    "deviceLabel" TEXT NOT NULL,
    "ipHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthRefreshToken" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthRefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthRefreshToken_tokenHash_key"
ON "AuthRefreshToken"("tokenHash");

CREATE INDEX "AuthSession_tenantId_userId_revokedAt_idx"
ON "AuthSession"("tenantId", "userId", "revokedAt");

CREATE INDEX "AuthSession_userId_revokedAt_idx"
ON "AuthSession"("userId", "revokedAt");

CREATE INDEX "AuthSession_expiresAt_idx"
ON "AuthSession"("expiresAt");

CREATE INDEX "AuthRefreshToken_sessionId_createdAt_idx"
ON "AuthRefreshToken"("sessionId", "createdAt");

CREATE INDEX "AuthRefreshToken_expiresAt_idx"
ON "AuthRefreshToken"("expiresAt");

ALTER TABLE "AuthSession"
ADD CONSTRAINT "AuthSession_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuthSession"
ADD CONSTRAINT "AuthSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuthRefreshToken"
ADD CONSTRAINT "AuthRefreshToken_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "AuthSession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION "enforce_auth_session_user_tenant"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "User" AS candidate_user
    WHERE candidate_user."id" = NEW."userId"
      AND candidate_user."tenantId" IS NOT DISTINCT FROM NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'AuthSession user does not belong to its tenant'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AuthSession_user_tenant_guard"
BEFORE INSERT OR UPDATE OF "userId", "tenantId"
ON "AuthSession"
FOR EACH ROW
EXECUTE FUNCTION "enforce_auth_session_user_tenant"();

COMMIT;
