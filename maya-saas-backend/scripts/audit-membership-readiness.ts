import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

interface AuditRow {
  code: string;
  count: number;
}

interface AuditResult {
  code: string;
  count: number;
  blocking: boolean;
}

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  return databaseUrl;
}

async function migrationBlockers(prisma: PrismaClient): Promise<AuditRow[]> {
  return prisma.$queryRaw<AuditRow[]>`
    SELECT 'unsupported_tenant_status' AS code, COUNT(*)::int AS count
    FROM "Tenant"
    WHERE "status"::text NOT IN (
      'trial', 'active', 'past_due', 'suspended', 'cancelled'
    )
    UNION ALL
    SELECT 'unsupported_calendar_source', COUNT(*)::int
    FROM "Tenant"
    WHERE "calendarSource"::text NOT IN ('internal', 'external')
    UNION ALL
    SELECT 'unsupported_user_role', COUNT(*)::int
    FROM "User"
    WHERE "role"::text NOT IN (
      'platform_owner', 'platform_admin', 'tenant_owner', 'business_owner',
      'administrator', 'manager', 'provider', 'employee', 'accountant',
      'customer', 'integration_service', 'tenant_admin', 'branch_manager',
      'staff', 'client'
    )
    UNION ALL
    SELECT 'unsupported_user_status', COUNT(*)::int
    FROM "User"
    WHERE "status"::text NOT IN ('active', 'suspended', 'invited')
    UNION ALL
    SELECT 'unsupported_membership_role', COUNT(*)::int
    FROM "Membership"
    WHERE "role"::text NOT IN (
      'platform_owner', 'platform_admin', 'tenant_owner', 'business_owner',
      'administrator', 'manager', 'provider', 'employee', 'accountant',
      'customer', 'integration_service', 'tenant_admin', 'branch_manager',
      'staff', 'client'
    )
    UNION ALL
    SELECT 'unsupported_membership_status', COUNT(*)::int
    FROM "Membership"
    WHERE "status"::text NOT IN ('active', 'suspended', 'invited')
    UNION ALL
    SELECT 'auth_identity_without_membership', COUNT(*)::int
    FROM "AuthIdentity" record
    LEFT JOIN "Membership" membership
      ON membership."userId" = record."userId"
     AND membership."tenantId" = record."tenantId"
    WHERE membership."id" IS NULL
    UNION ALL
    SELECT 'tenant_session_without_membership', COUNT(*)::int
    FROM "AuthSession" record
    LEFT JOIN "Membership" membership
      ON membership."userId" = record."userId"
     AND membership."tenantId" = record."tenantId"
    WHERE record."tenantId" IS NOT NULL
      AND membership."id" IS NULL
    UNION ALL
    SELECT 'provider_without_membership', COUNT(*)::int
    FROM "InternalProvider" record
    LEFT JOIN "Membership" membership
      ON membership."userId" = record."userId"
     AND membership."tenantId" = record."tenantId"
    WHERE record."userId" IS NOT NULL
      AND membership."id" IS NULL
    UNION ALL
    SELECT 'customer_profile_without_membership', COUNT(*)::int
    FROM "CustomerProfile" record
    LEFT JOIN "Membership" membership
      ON membership."userId" = record."userId"
     AND membership."tenantId" = record."tenantId"
    WHERE membership."id" IS NULL
    UNION ALL
    SELECT 'loyalty_account_without_membership', COUNT(*)::int
    FROM "LoyaltyAccount" record
    LEFT JOIN "Membership" membership
      ON membership."userId" = record."userId"
     AND membership."tenantId" = record."tenantId"
    WHERE membership."id" IS NULL
    UNION ALL
    SELECT 'appointment_client_without_membership', COUNT(*)::int
    FROM "Appointment" record
    LEFT JOIN "Membership" membership
      ON membership."userId" = record."clientId"
     AND membership."tenantId" = record."tenantId"
    WHERE membership."id" IS NULL
    UNION ALL
    SELECT 'legacy_user_cross_tenant_branch', COUNT(*)::int
    FROM "User" record
    JOIN "Branch" branch ON branch."id" = record."branchId"
    WHERE record."branchId" IS NOT NULL
      AND (
        record."tenantId" IS NULL OR
        branch."tenantId" <> record."tenantId"
      )
    UNION ALL
    SELECT 'provider_cross_tenant_branch', COUNT(*)::int
    FROM "InternalProvider" record
    JOIN "Branch" branch ON branch."id" = record."branchId"
    WHERE record."branchId" IS NOT NULL
      AND branch."tenantId" <> record."tenantId"
    UNION ALL
    SELECT 'appointment_cross_tenant_branch', COUNT(*)::int
    FROM "Appointment" record
    JOIN "Branch" branch ON branch."id" = record."branchId"
    WHERE record."branchId" IS NOT NULL
      AND branch."tenantId" <> record."tenantId"
  `;
}

async function cleanupReadiness(prisma: PrismaClient): Promise<AuditRow[]> {
  return prisma.$queryRaw<AuditRow[]>`
    SELECT 'legacy_tenant_user_without_membership' AS code, COUNT(*)::int AS count
    FROM "User" account
    WHERE account."tenantId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "Membership" membership
        WHERE membership."userId" = account."id"
          AND membership."tenantId" = account."tenantId"
      )
    UNION ALL
    SELECT 'legacy_role_differs_from_membership', COUNT(*)::int
    FROM "User" account
    JOIN "Membership" membership
      ON membership."userId" = account."id"
     AND membership."tenantId" = account."tenantId"
    WHERE account."role"::text <> membership."role"::text
    UNION ALL
    SELECT 'legacy_branch_differs_from_membership', COUNT(*)::int
    FROM "User" account
    JOIN "Membership" membership
      ON membership."userId" = account."id"
     AND membership."tenantId" = account."tenantId"
    WHERE account."branchId" IS DISTINCT FROM membership."branchId"
    UNION ALL
    SELECT 'duplicate_normalized_email_groups', COUNT(*)::int
    FROM (
      SELECT LOWER(BTRIM("email"))
      FROM "User"
      GROUP BY LOWER(BTRIM("email"))
      HAVING COUNT(*) > 1
    ) duplicates
    UNION ALL
    SELECT 'duplicate_normalized_phone_groups', COUNT(*)::int
    FROM (
      SELECT REGEXP_REPLACE("phone", '[^0-9]', '', 'g') AS normalized_phone
      FROM "User"
      WHERE "phone" IS NOT NULL
        AND REGEXP_REPLACE("phone", '[^0-9]', '', 'g') <> ''
      GROUP BY REGEXP_REPLACE("phone", '[^0-9]', '', 'g')
      HAVING COUNT(*) > 1
    ) duplicates
    UNION ALL
    SELECT 'users_with_multiple_memberships', COUNT(*)::int
    FROM (
      SELECT "userId"
      FROM "Membership"
      GROUP BY "userId"
      HAVING COUNT(*) > 1
    ) multi_tenant_accounts
  `;
}

function normalize(rows: AuditRow[], blocking: boolean): AuditResult[] {
  return rows.map((row) => ({
    code: row.code,
    count: Number(row.count),
    blocking,
  }));
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireDatabaseUrl() }),
  });

  try {
    await prisma.$queryRaw`SELECT 1`;
    const migration = normalize(await migrationBlockers(prisma), true);
    const cleanup = normalize(await cleanupReadiness(prisma), false);
    const blocking = migration.filter((result) => result.count > 0);

    process.stdout.write(
      JSON.stringify(
        {
          ok: blocking.length === 0,
          migration_blockers: migration,
          legacy_user_cleanup_readiness: cleanup,
          note: 'Only aggregate counts are emitted; no identity or secret values are printed.',
        },
        null,
        2,
      ) + '\n',
    );

    if (blocking.length > 0) {
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    JSON.stringify({
      ok: false,
      error: {
        code: 'membership_readiness_audit_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    }) + '\n',
  );
  process.exitCode = 1;
});
