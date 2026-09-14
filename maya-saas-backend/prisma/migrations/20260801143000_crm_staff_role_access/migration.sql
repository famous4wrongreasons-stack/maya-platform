CREATE TYPE "CrmStaffAccessStatus" AS ENUM (
  'pending_contact',
  'active',
  'disabled'
);

CREATE TABLE "CrmStaffAccess" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "externalStaffId" TEXT NOT NULL,
  "userId" TEXT,
  "encryptedDisplayName" TEXT NOT NULL,
  "title" TEXT,
  "role" "UserRole" NOT NULL,
  "status" "CrmStaffAccessStatus" NOT NULL DEFAULT 'pending_contact',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CrmStaffAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmStaffAccess_tenantId_externalStaffId_key"
  ON "CrmStaffAccess"("tenantId", "externalStaffId");

CREATE UNIQUE INDEX "CrmStaffAccess_tenantId_userId_key"
  ON "CrmStaffAccess"("tenantId", "userId");

CREATE INDEX "CrmStaffAccess_tenantId_role_status_idx"
  ON "CrmStaffAccess"("tenantId", "role", "status");

CREATE INDEX "CrmStaffAccess_userId_idx"
  ON "CrmStaffAccess"("userId");

ALTER TABLE "CrmStaffAccess"
  ADD CONSTRAINT "CrmStaffAccess_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CrmStaffAccess"
  ADD CONSTRAINT "CrmStaffAccess_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
