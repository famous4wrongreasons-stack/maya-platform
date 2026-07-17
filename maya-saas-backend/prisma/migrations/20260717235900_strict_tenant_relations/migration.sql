BEGIN;

-- Fail before changing data if legacy values cannot be represented safely.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Tenant"
    WHERE "status" NOT IN ('trial', 'active', 'past_due', 'suspended', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'Tenant.status contains unsupported values';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Tenant"
    WHERE "calendarSource" NOT IN ('internal', 'external')
  ) THEN
    RAISE EXCEPTION 'Tenant.calendarSource contains unsupported values';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "User"
    WHERE "role" NOT IN (
      'platform_owner', 'platform_admin', 'tenant_owner', 'business_owner',
      'administrator', 'manager', 'provider', 'employee', 'accountant',
      'customer', 'integration_service', 'tenant_admin', 'branch_manager',
      'staff', 'client'
    )
  ) THEN
    RAISE EXCEPTION 'User.role contains unsupported values';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "User"
    WHERE "status" NOT IN ('active', 'suspended', 'invited')
  ) THEN
    RAISE EXCEPTION 'User.status contains unsupported values';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Membership"
    WHERE "role" NOT IN (
      'platform_owner', 'platform_admin', 'tenant_owner', 'business_owner',
      'administrator', 'manager', 'provider', 'employee', 'accountant',
      'customer', 'integration_service', 'tenant_admin', 'branch_manager',
      'staff', 'client'
    )
  ) THEN
    RAISE EXCEPTION 'Membership.role contains unsupported values';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Membership"
    WHERE "status" NOT IN ('active', 'suspended', 'invited')
  ) THEN
    RAISE EXCEPTION 'Membership.status contains unsupported values';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "AuthIdentity" record
    LEFT JOIN "Membership" membership
      ON membership."userId" = record."userId"
     AND membership."tenantId" = record."tenantId"
    WHERE membership."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'AuthIdentity exists without tenant Membership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "AuthSession" record
    LEFT JOIN "Membership" membership
      ON membership."userId" = record."userId"
     AND membership."tenantId" = record."tenantId"
    WHERE record."tenantId" IS NOT NULL
      AND membership."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Tenant AuthSession exists without Membership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "User" record
    JOIN "Branch" branch ON branch."id" = record."branchId"
    WHERE record."branchId" IS NOT NULL
      AND (
        record."tenantId" IS NULL OR
        branch."tenantId" <> record."tenantId"
      )
  ) THEN
    RAISE EXCEPTION 'Legacy User branch crosses tenant boundary';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "InternalProvider" record
    LEFT JOIN "Membership" membership
      ON membership."userId" = record."userId"
     AND membership."tenantId" = record."tenantId"
    WHERE record."userId" IS NOT NULL
      AND membership."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'InternalProvider user exists without Membership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "CustomerProfile" record
    LEFT JOIN "Membership" membership
      ON membership."userId" = record."userId"
     AND membership."tenantId" = record."tenantId"
    WHERE membership."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'CustomerProfile exists without Membership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "LoyaltyAccount" record
    LEFT JOIN "Membership" membership
      ON membership."userId" = record."userId"
     AND membership."tenantId" = record."tenantId"
    WHERE membership."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'LoyaltyAccount exists without Membership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Appointment" record
    LEFT JOIN "Membership" membership
      ON membership."userId" = record."clientId"
     AND membership."tenantId" = record."tenantId"
    WHERE membership."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Appointment client exists without Membership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "InternalProvider" record
    JOIN "Branch" branch ON branch."id" = record."branchId"
    WHERE record."branchId" IS NOT NULL
      AND branch."tenantId" <> record."tenantId"
  ) THEN
    RAISE EXCEPTION 'InternalProvider branch crosses tenant boundary';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Appointment" record
    JOIN "Branch" branch ON branch."id" = record."branchId"
    WHERE record."branchId" IS NOT NULL
      AND branch."tenantId" <> record."tenantId"
  ) THEN
    RAISE EXCEPTION 'Appointment branch crosses tenant boundary';
  END IF;
END $$;

CREATE TYPE "TenantStatus" AS ENUM (
  'trial', 'active', 'past_due', 'suspended', 'cancelled'
);
CREATE TYPE "UserRole" AS ENUM (
  'platform_owner', 'platform_admin', 'tenant_owner', 'business_owner',
  'administrator', 'manager', 'provider', 'employee', 'accountant',
  'customer', 'integration_service', 'tenant_admin', 'branch_manager',
  'staff', 'client'
);
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended', 'invited');
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'suspended', 'invited');
CREATE TYPE "CalendarSource" AS ENUM ('internal', 'external');

ALTER TABLE "Tenant" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Tenant"
  ALTER COLUMN "status" TYPE "TenantStatus"
  USING "status"::text::"TenantStatus";
ALTER TABLE "Tenant" ALTER COLUMN "status" SET DEFAULT 'trial';

ALTER TABLE "Tenant" ALTER COLUMN "calendarSource" DROP DEFAULT;
ALTER TABLE "Tenant"
  ALTER COLUMN "calendarSource" TYPE "CalendarSource"
  USING "calendarSource"::text::"CalendarSource";
ALTER TABLE "Tenant" ALTER COLUMN "calendarSource" SET DEFAULT 'external';

ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole"
  USING "role"::text::"UserRole";
ALTER TABLE "User" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "status" TYPE "UserStatus"
  USING "status"::text::"UserStatus";
ALTER TABLE "User" ALTER COLUMN "status" SET DEFAULT 'active';

ALTER TABLE "Membership" ALTER COLUMN "role" TYPE "UserRole"
  USING "role"::text::"UserRole";
ALTER TABLE "Membership" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Membership" ALTER COLUMN "status" TYPE "MembershipStatus"
  USING "status"::text::"MembershipStatus";
ALTER TABLE "Membership" ALTER COLUMN "status" SET DEFAULT 'active';

-- Replace composite User FKs with global User(id) plus Membership authority.
ALTER TABLE "User" DROP CONSTRAINT "User_branchId_fkey";
ALTER TABLE "User"
  ADD CONSTRAINT "User_branchId_tenantId_fkey"
  FOREIGN KEY ("branchId", "tenantId")
  REFERENCES "Branch"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuthIdentity"
  DROP CONSTRAINT "AuthIdentity_userId_tenantId_fkey";
ALTER TABLE "AuthIdentity"
  ADD CONSTRAINT "AuthIdentity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthIdentity"
  ADD CONSTRAINT "AuthIdentity_userId_tenantId_fkey"
  FOREIGN KEY ("userId", "tenantId")
  REFERENCES "Membership"("userId", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuthSession"
  ADD CONSTRAINT "AuthSession_userId_tenantId_fkey"
  FOREIGN KEY ("userId", "tenantId")
  REFERENCES "Membership"("userId", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InternalProvider"
  DROP CONSTRAINT "InternalProvider_userId_tenantId_fkey",
  DROP CONSTRAINT "InternalProvider_branchId_fkey";
ALTER TABLE "InternalProvider"
  ADD CONSTRAINT "InternalProvider_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InternalProvider"
  ADD CONSTRAINT "InternalProvider_userId_tenantId_fkey"
  FOREIGN KEY ("userId", "tenantId")
  REFERENCES "Membership"("userId", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InternalProvider"
  ADD CONSTRAINT "InternalProvider_branchId_tenantId_fkey"
  FOREIGN KEY ("branchId", "tenantId")
  REFERENCES "Branch"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomerProfile"
  DROP CONSTRAINT "CustomerProfile_userId_tenantId_fkey";
ALTER TABLE "CustomerProfile"
  ADD CONSTRAINT "CustomerProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerProfile"
  ADD CONSTRAINT "CustomerProfile_userId_tenantId_fkey"
  FOREIGN KEY ("userId", "tenantId")
  REFERENCES "Membership"("userId", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LoyaltyAccount"
  DROP CONSTRAINT "LoyaltyAccount_userId_tenantId_fkey";
ALTER TABLE "LoyaltyAccount"
  ADD CONSTRAINT "LoyaltyAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyAccount"
  ADD CONSTRAINT "LoyaltyAccount_userId_tenantId_fkey"
  FOREIGN KEY ("userId", "tenantId")
  REFERENCES "Membership"("userId", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Appointment"
  DROP CONSTRAINT "Appointment_branchId_fkey";
ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_clientId_tenantId_fkey"
  FOREIGN KEY ("clientId", "tenantId")
  REFERENCES "Membership"("userId", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_branchId_tenantId_fkey"
  FOREIGN KEY ("branchId", "tenantId")
  REFERENCES "Branch"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Historical actors reference the global account, not current authorization.
ALTER TABLE "LoyaltyTransaction"
  DROP CONSTRAINT "LoyaltyTransaction_actorUserId_tenantId_fkey";
ALTER TABLE "LoyaltyTransaction"
  ADD CONSTRAINT "LoyaltyTransaction_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Expense"
  DROP CONSTRAINT "Expense_createdById_tenantId_fkey";
ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiApprovalRequest"
  DROP CONSTRAINT "AiApprovalRequest_requestedByUserId_tenantId_fkey",
  DROP CONSTRAINT "AiApprovalRequest_decidedByUserId_tenantId_fkey";
ALTER TABLE "AiApprovalRequest"
  ADD CONSTRAINT "AiApprovalRequest_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiApprovalRequest"
  ADD CONSTRAINT "AiApprovalRequest_decidedByUserId_fkey"
  FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiToolExecution"
  DROP CONSTRAINT "AiToolExecution_actorUserId_tenantId_fkey";
ALTER TABLE "AiToolExecution"
  ADD CONSTRAINT "AiToolExecution_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Companion tenant columns may be null for platform actors, but never foreign.
ALTER TABLE "LoyaltyTransaction"
  ADD CONSTRAINT "LoyaltyTransaction_actor_tenant_match"
  CHECK ("actorTenantId" IS NULL OR "actorTenantId" = "tenantId");
ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_branch_tenant_match"
  CHECK (
    "branchId" IS NULL OR
    ("branchTenantId" IS NOT NULL AND "branchTenantId" = "tenantId")
  ),
  ADD CONSTRAINT "Expense_creator_tenant_match"
  CHECK ("createdByTenantId" IS NULL OR "createdByTenantId" = "tenantId");
ALTER TABLE "AiApprovalRequest"
  ADD CONSTRAINT "AiApprovalRequest_requester_tenant_match"
  CHECK (
    "requestedByTenantId" IS NULL OR "requestedByTenantId" = "tenantId"
  ),
  ADD CONSTRAINT "AiApprovalRequest_decider_tenant_match"
  CHECK ("decidedByTenantId" IS NULL OR "decidedByTenantId" = "tenantId");
ALTER TABLE "AiToolExecution"
  ADD CONSTRAINT "AiToolExecution_actor_tenant_match"
  CHECK ("actorTenantId" IS NULL OR "actorTenantId" = "tenantId"),
  ADD CONSTRAINT "AiToolExecution_approval_tenant_match"
  CHECK (
    "approvalTenantId" IS NULL OR "approvalTenantId" = "tenantId"
  );

-- Keep physical names aligned with the current Prisma relation declarations.
ALTER TABLE "AiToolExecution"
  RENAME CONSTRAINT "AiToolExecution_approvalRequestId_tenantId_fkey"
  TO "AiToolExecution_approvalRequestId_approvalTenantId_fkey";
ALTER TABLE "Expense"
  RENAME CONSTRAINT "Expense_branchId_fkey"
  TO "Expense_branchId_branchTenantId_fkey";
ALTER INDEX "InternalAvailabilityException_tenant_provider_range_idx"
  RENAME TO "InternalAvailabilityException_tenantId_providerId_startAt_e_idx";
ALTER INDEX "InternalAvailabilityRule_tenant_provider_weekday_active_idx"
  RENAME TO "InternalAvailabilityRule_tenantId_providerId_weekday_active_idx";
ALTER INDEX "InternalAvailabilityRule_tenant_provider_weekday_range_key"
  RENAME TO "InternalAvailabilityRule_tenantId_providerId_weekday_startM_key";

COMMIT;
