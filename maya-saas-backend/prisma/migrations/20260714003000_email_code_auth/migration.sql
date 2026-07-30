-- Tenant-scoped passwordless email login for existing MAYA users.

CREATE TABLE "EmailAuthCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAuthCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailAuthCode_id_tenantId_key" ON "EmailAuthCode"("id", "tenantId");
CREATE UNIQUE INDEX "EmailAuthCode_tenantId_email_key" ON "EmailAuthCode"("tenantId", "email");
CREATE INDEX "EmailAuthCode_tenantId_expiresAt_idx" ON "EmailAuthCode"("tenantId", "expiresAt");
CREATE INDEX "EmailAuthCode_expiresAt_idx" ON "EmailAuthCode"("expiresAt");
CREATE INDEX "EmailAuthCode_consumedAt_idx" ON "EmailAuthCode"("consumedAt");

ALTER TABLE "EmailAuthCode" ADD CONSTRAINT "EmailAuthCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
