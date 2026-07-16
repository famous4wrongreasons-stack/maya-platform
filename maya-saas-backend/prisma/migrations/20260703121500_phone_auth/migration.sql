-- Phone-first client auth support

CREATE TABLE "PhoneAuthCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneAuthCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_tenantId_phone_key" ON "User"("tenantId", "phone");
CREATE UNIQUE INDEX "PhoneAuthCode_tenantId_phone_key" ON "PhoneAuthCode"("tenantId", "phone");
CREATE INDEX "PhoneAuthCode_tenantId_expiresAt_idx" ON "PhoneAuthCode"("tenantId", "expiresAt");

ALTER TABLE "PhoneAuthCode" ADD CONSTRAINT "PhoneAuthCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
