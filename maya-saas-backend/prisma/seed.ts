import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createCipheriv, createHash, randomBytes } from 'crypto';

import {
  MAYA_FEATURE_KEYS,
  MAYA_FEATURE_REGISTRY,
  MAYA_PLAN_FEATURES,
  buildFeatureFlags,
  expandFeatureKeys,
} from '../src/common/feature-catalog';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required for prisma seed');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const platformOwnerEmail =
  process.env.SEED_PLATFORM_OWNER_EMAIL ?? 'owner@maya.local';
const platformOwnerPassword =
  process.env.SEED_PLATFORM_OWNER_PASSWORD ?? 'ChangeMe123!';
const demoTenantAdminEmail =
  process.env.SEED_DEMO_TENANT_ADMIN_EMAIL ?? 'admin@demo-business.local';
const demoTenantAdminPassword =
  process.env.SEED_DEMO_TENANT_ADMIN_PASSWORD ?? 'ChangeMe123!';
const defaultTenantSlug = process.env.SEED_DEFAULT_TENANT_SLUG ?? 'malesthetic';
const defaultTenantName =
  process.env.SEED_DEFAULT_TENANT_NAME ?? 'Мужская Эстетика';

const encryptToken = (plainText: string) => {
  const secret = process.env.CRM_ENCRYPTION_KEY ?? 'change-me-in-production';
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
};

async function upsertPlatformOwner(passwordHash: string) {
  const existing = await prisma.user.findFirst({
    where: {
      tenantId: null,
      email: platformOwnerEmail.toLowerCase(),
      role: 'platform_owner',
    },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        status: 'active',
      },
    });

    return existing.id;
  }

  const created = await prisma.user.create({
    data: {
      tenantId: null,
      email: platformOwnerEmail.toLowerCase(),
      passwordHash,
      role: 'platform_owner',
      status: 'active',
    },
  });

  return created.id;
}

async function upsertTenantAdmin(
  tenantId: string,
  branchId: string,
  passwordHash: string,
) {
  const existing = await prisma.user.findFirst({
    where: {
      email: demoTenantAdminEmail.toLowerCase(),
      memberships: { some: { tenantId } },
    },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        branchId,
        passwordHash,
        role: 'tenant_admin',
        status: 'active',
      },
    });

    await prisma.membership.upsert({
      where: {
        userId_tenantId: {
          userId: existing.id,
          tenantId,
        },
      },
      update: {
        branchId,
        role: 'tenant_admin',
        status: 'active',
        joinedAt: existing.createdAt,
      },
      create: {
        userId: existing.id,
        tenantId,
        branchId,
        role: 'tenant_admin',
        status: 'active',
        joinedAt: existing.createdAt,
      },
    });

    return existing.id;
  }

  const created = await prisma.user.create({
    data: {
      tenantId,
      branchId,
      email: demoTenantAdminEmail.toLowerCase(),
      passwordHash,
      role: 'tenant_admin',
      status: 'active',
    },
  });

  await prisma.membership.create({
    data: {
      userId: created.id,
      tenantId,
      branchId,
      role: 'tenant_admin',
      status: 'active',
      joinedAt: created.createdAt,
    },
  });

  return created.id;
}

async function upsertFeatureRegistry() {
  for (const key of MAYA_FEATURE_KEYS) {
    const definition = MAYA_FEATURE_REGISTRY[key];

    await prisma.feature.upsert({
      where: { key },
      update: {
        name: definition.name,
        description: definition.description,
        module: definition.module,
        status: definition.status,
      },
      create: {
        key,
        name: definition.name,
        description: definition.description,
        module: definition.module,
        status: definition.status,
      },
    });
  }
}

async function syncPlanEntitlements(
  planId: string,
  featureKeys: ReadonlyArray<string>,
) {
  for (const featureKey of expandFeatureKeys(featureKeys)) {
    await prisma.planEntitlement.upsert({
      where: {
        planId_featureKey: {
          planId,
          featureKey,
        },
      },
      update: { enabled: true },
      create: {
        planId,
        featureKey,
        enabled: true,
      },
    });
  }
}

async function main() {
  const passwordHash = await bcrypt.hash(platformOwnerPassword, 10);
  const tenantAdminPasswordHash = await bcrypt.hash(
    demoTenantAdminPassword,
    10,
  );

  await upsertFeatureRegistry();

  const soloPlan = await prisma.subscriptionPlan.upsert({
    where: { name: 'solo' },
    update: {
      priceMonthly: 990,
      maxBranches: 1,
      maxStaff: 5,
      featuresJson: buildFeatureFlags(
        MAYA_PLAN_FEATURES.solo,
      ) satisfies Prisma.InputJsonValue,
      isWhiteLabelEnabled: false,
    },
    create: {
      name: 'solo',
      priceMonthly: 990,
      maxBranches: 1,
      maxStaff: 5,
      featuresJson: buildFeatureFlags(
        MAYA_PLAN_FEATURES.solo,
      ) satisfies Prisma.InputJsonValue,
      isWhiteLabelEnabled: false,
    },
  });

  const businessPlan = await prisma.subscriptionPlan.upsert({
    where: { name: 'business' },
    update: {
      priceMonthly: 1990,
      maxBranches: 3,
      maxStaff: 25,
      featuresJson: buildFeatureFlags(
        MAYA_PLAN_FEATURES.business,
      ) satisfies Prisma.InputJsonValue,
      isWhiteLabelEnabled: false,
    },
    create: {
      name: 'business',
      priceMonthly: 1990,
      maxBranches: 3,
      maxStaff: 25,
      featuresJson: buildFeatureFlags(
        MAYA_PLAN_FEATURES.business,
      ) satisfies Prisma.InputJsonValue,
      isWhiteLabelEnabled: false,
    },
  });

  const businessPlusPlan = await prisma.subscriptionPlan.upsert({
    where: { name: 'business_plus' },
    update: {
      priceMonthly: 2990,
      maxBranches: 10,
      maxStaff: 100,
      featuresJson: buildFeatureFlags(
        MAYA_PLAN_FEATURES.business_plus,
      ) satisfies Prisma.InputJsonValue,
      isWhiteLabelEnabled: true,
    },
    create: {
      name: 'business_plus',
      priceMonthly: 2990,
      maxBranches: 10,
      maxStaff: 100,
      featuresJson: buildFeatureFlags(
        MAYA_PLAN_FEATURES.business_plus,
      ) satisfies Prisma.InputJsonValue,
      isWhiteLabelEnabled: true,
    },
  });

  await syncPlanEntitlements(soloPlan.id, MAYA_PLAN_FEATURES.solo);
  await syncPlanEntitlements(businessPlan.id, MAYA_PLAN_FEATURES.business);
  await syncPlanEntitlements(
    businessPlusPlan.id,
    MAYA_PLAN_FEATURES.business_plus,
  );

  const defaultTenant = await prisma.tenant.upsert({
    where: { slug: defaultTenantSlug },
    update: {
      name: defaultTenantName,
      status: 'active',
      planId: businessPlusPlan.id,
      industryPresetId: 'barbershop',
      calendarSource: 'external',
      defaultCurrency: 'RUB',
      defaultTimezone: 'Europe/Moscow',
      defaultLocale: 'ru-RU',
      subdomain: defaultTenantSlug,
      allowSelfRegistration: true,
    },
    create: {
      name: defaultTenantName,
      slug: defaultTenantSlug,
      status: 'active',
      planId: businessPlusPlan.id,
      industryPresetId: 'barbershop',
      calendarSource: 'external',
      defaultCurrency: 'RUB',
      defaultTimezone: 'Europe/Moscow',
      defaultLocale: 'ru-RU',
      subdomain: defaultTenantSlug,
      allowSelfRegistration: true,
    },
  });

  await prisma.brandingSettings.upsert({
    where: { tenantId: defaultTenant.id },
    update: {
      appName: defaultTenantName,
      primaryColor: '#aaa69d',
      secondaryColor: '#7d7970',
      accentColor: '#aaa69d',
      backgroundColor: '#f4f0eb',
      surfaceColor: '#fffdf9',
      textPrimaryColor: '#18160f',
      textSecondaryColor: 'rgba(24,22,15,0.55)',
      fontFamily: 'Montserrat',
      headingFontFamily: 'Montserrat',
      buttonRadius: 999,
      buttonStyle: 'pill',
      themeMode: 'system',
      borderRadiusJson: {
        sm: 12,
        md: 18,
        lg: 28,
        full: 999,
      } satisfies Prisma.InputJsonValue,
      themeJson: {
        preset: 'maya-aurora',
        appearance: 'aurora',
        booking: { mode: 'live' },
      } satisfies Prisma.InputJsonValue,
    },
    create: {
      tenantId: defaultTenant.id,
      appName: defaultTenantName,
      primaryColor: '#aaa69d',
      secondaryColor: '#7d7970',
      accentColor: '#aaa69d',
      backgroundColor: '#f4f0eb',
      surfaceColor: '#fffdf9',
      textPrimaryColor: '#18160f',
      textSecondaryColor: 'rgba(24,22,15,0.55)',
      fontFamily: 'Montserrat',
      headingFontFamily: 'Montserrat',
      buttonRadius: 999,
      buttonStyle: 'pill',
      themeMode: 'system',
      borderRadiusJson: {
        sm: 12,
        md: 18,
        lg: 28,
        full: 999,
      } satisfies Prisma.InputJsonValue,
      themeJson: {
        preset: 'maya-aurora',
        appearance: 'aurora',
        booking: { mode: 'live' },
      } satisfies Prisma.InputJsonValue,
    },
  });

  const defaultBranch = await prisma.branch.findFirst({
    where: { tenantId: defaultTenant.id },
    orderBy: { createdAt: 'asc' },
  });

  if (!defaultBranch) {
    await prisma.branch.create({
      data: {
        tenantId: defaultTenant.id,
        name: defaultTenantName,
        timezone: 'Europe/Moscow',
      },
    });
  }

  const demoTenant = await prisma.tenant.upsert({
    where: { slug: 'demo-business' },
    update: {
      name: 'Maya Service Demo',
      status: 'active',
      planId: businessPlusPlan.id,
      industryPresetId: 'general_service',
      calendarSource: 'external',
      defaultCurrency: 'RUB',
      defaultTimezone: 'Europe/Moscow',
      defaultLocale: 'ru-RU',
      subdomain: 'demo-business',
      allowSelfRegistration: true,
    },
    create: {
      name: 'Maya Service Demo',
      slug: 'demo-business',
      status: 'active',
      planId: businessPlusPlan.id,
      industryPresetId: 'general_service',
      calendarSource: 'external',
      defaultCurrency: 'RUB',
      defaultTimezone: 'Europe/Moscow',
      defaultLocale: 'ru-RU',
      subdomain: 'demo-business',
      allowSelfRegistration: true,
    },
  });

  await prisma.brandingSettings.upsert({
    where: { tenantId: demoTenant.id },
    update: {
      appName: 'Maya Service Demo',
      logoUrl: null,
      primaryColor: '#000000',
      secondaryColor: '#FFFFFF',
      accentColor: '#000000',
      backgroundColor: '#FFFFFF',
      surfaceColor: '#FFFFFF',
      textPrimaryColor: '#000000',
      textSecondaryColor: 'rgba(0,0,0,0.58)',
      backgroundImageUrl: null,
      fontFamily: 'Manrope',
      headingFontFamily: 'Montserrat',
      buttonRadius: 18,
      buttonStyle: 'rounded',
      themeMode: 'system',
      themeJson: {
        appearance: 'maya-monochrome',
        accent_glow: false,
        industryPresetId: 'general_service',
      } satisfies Prisma.InputJsonValue,
    },
    create: {
      tenantId: demoTenant.id,
      appName: 'Maya Service Demo',
      logoUrl: null,
      primaryColor: '#000000',
      secondaryColor: '#FFFFFF',
      accentColor: '#000000',
      backgroundColor: '#FFFFFF',
      surfaceColor: '#FFFFFF',
      textPrimaryColor: '#000000',
      textSecondaryColor: 'rgba(0,0,0,0.58)',
      backgroundImageUrl: null,
      fontFamily: 'Manrope',
      headingFontFamily: 'Montserrat',
      buttonRadius: 18,
      buttonStyle: 'rounded',
      themeMode: 'system',
      themeJson: {
        appearance: 'maya-monochrome',
        accent_glow: false,
        industryPresetId: 'general_service',
      } satisfies Prisma.InputJsonValue,
    },
  });

  const demoBranchExisting = await prisma.branch.findFirst({
    where: {
      tenantId: demoTenant.id,
      name: 'Demo Location',
    },
  });

  const demoBranch = demoBranchExisting
    ? await prisma.branch.update({
        where: { id: demoBranchExisting.id },
        data: {
          address: 'Moscow, Demo street 1',
          phone: '+79990000000',
          timezone: 'Europe/Moscow',
        },
      })
    : await prisma.branch.create({
        data: {
          tenantId: demoTenant.id,
          name: 'Demo Location',
          address: 'Moscow, Demo street 1',
          phone: '+79990000000',
          timezone: 'Europe/Moscow',
        },
      });

  await prisma.crmIntegration.upsert({
    where: { tenantId: demoTenant.id },
    update: {
      provider: 'mock',
      encryptedApiToken: encryptToken('mock-demo-token'),
      baseUrl: 'https://mock-crm.local',
      status: 'active',
      settingsJson: {
        dataset: 'general-service',
        industryPresetId: 'general_service',
      } satisfies Prisma.InputJsonValue,
    },
    create: {
      tenantId: demoTenant.id,
      provider: 'mock',
      encryptedApiToken: encryptToken('mock-demo-token'),
      baseUrl: 'https://mock-crm.local',
      status: 'active',
      settingsJson: {
        dataset: 'general-service',
        industryPresetId: 'general_service',
      } satisfies Prisma.InputJsonValue,
    },
  });

  const platformOwnerId = await upsertPlatformOwner(passwordHash);
  const tenantAdminId = await upsertTenantAdmin(
    demoTenant.id,
    demoBranch.id,
    tenantAdminPasswordHash,
  );

  console.log(
    JSON.stringify(
      {
        platform_owner: {
          user_id: platformOwnerId,
          email: platformOwnerEmail,
          credentials_source: 'SEED_PLATFORM_OWNER_PASSWORD',
        },
        default_tenant: {
          tenant_id: defaultTenant.id,
          slug: defaultTenant.slug,
        },
        demo_tenant: {
          tenant_id: demoTenant.id,
          slug: demoTenant.slug,
          tenant_admin_user_id: tenantAdminId,
          tenant_admin_email: demoTenantAdminEmail,
          credentials_source: 'SEED_DEMO_TENANT_ADMIN_PASSWORD',
          branch_id: demoBranch.id,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
