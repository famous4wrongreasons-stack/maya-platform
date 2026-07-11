-- Add tenant-qualified keys for auth state and identity mutations.
BEGIN;

CREATE UNIQUE INDEX "User_id_tenantId_key"
ON "User"("id", "tenantId");

-- Refuse the migration rather than preserving a cross-tenant identity link.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "AuthIdentity" AS identity
    LEFT JOIN "User" AS tenant_user
      ON tenant_user."id" = identity."userId"
      AND tenant_user."tenantId" = identity."tenantId"
    WHERE tenant_user."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'AuthIdentity contains a user from another tenant';
  END IF;
END $$;

ALTER TABLE "AuthIdentity"
DROP CONSTRAINT "AuthIdentity_userId_fkey";

ALTER TABLE "AuthIdentity"
ADD CONSTRAINT "AuthIdentity_userId_tenantId_fkey"
FOREIGN KEY ("userId", "tenantId")
REFERENCES "User"("id", "tenantId")
ON DELETE CASCADE
ON UPDATE CASCADE;

CREATE UNIQUE INDEX "AuthIdentity_id_tenantId_key"
ON "AuthIdentity"("id", "tenantId");

CREATE UNIQUE INDEX "AuthFlowState_id_tenantId_key"
ON "AuthFlowState"("id", "tenantId");

CREATE UNIQUE INDEX "PhoneAuthCode_id_tenantId_key"
ON "PhoneAuthCode"("id", "tenantId");

COMMIT;
