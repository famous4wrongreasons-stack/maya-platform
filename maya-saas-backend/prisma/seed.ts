import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createCipheriv, createHash, randomBytes } from 'crypto';

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
  process.env.SEED_DEMO_TENANT_ADMIN_EMAIL ?? 'admin@demo-salon.local';
const demoTenantAdminPassword =
  process.env.SEED_DEMO_TENANT_ADMIN_PASSWORD ?? 'ChangeMe123!';

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
      tenantId,
      email: demoTenantAdminEmail.toLowerCase(),
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

  return created.id;
}

async function main() {
  const passwordHash = await bcrypt.hash(platformOwnerPassword, 10);
  const tenantAdminPasswordHash = await bcrypt.hash(demoTenantAdminPassword, 10);

  const demoPlan = await prisma.subscriptionPlan.upsert({
    where: { name: 'Demo Plan' },
    update: {
      priceMonthly: 9900,
      maxBranches: 3,
      maxStaff: 25,
      featuresJson: {
        online_booking: true,
        available_slots: true,
        staff_directory: true,
        client_appointments: true,
      } satisfies Prisma.InputJsonValue,
      isWhiteLabelEnabled: true,
    },
    create: {
      name: 'Demo Plan',
      priceMonthly: 9900,
      maxBranches: 3,
      maxStaff: 25,
      featuresJson: {
        online_booking: true,
        available_slots: true,
        staff_directory: true,
        client_appointments: true,
      } satisfies Prisma.InputJsonValue,
      isWhiteLabelEnabled: true,
    },
  });

  const demoTenant = await prisma.tenant.upsert({
    where: { slug: 'demo-salon' },
    update: {
      name: 'Demo Salon',
      status: 'active',
      planId: demoPlan.id,
      allowSelfRegistration: true,
    },
    create: {
      name: 'Demo Salon',
      slug: 'demo-salon',
      status: 'active',
      planId: demoPlan.id,
      allowSelfRegistration: true,
    },
  });

  await prisma.brandingSettings.upsert({
    where: { tenantId: demoTenant.id },
    update: {
      appName: 'Maya Demo Salon',
      logoUrl: 'https://example.com/logo-demo-salon.png',
      primaryColor: '#111111',
      secondaryColor: '#C6A86A',
      backgroundImageUrl: 'https://example.com/bg-demo-salon.jpg',
      fontFamily: 'Manrope',
      buttonRadius: 18,
      themeJson: {
        appearance: 'premium-light',
        accent_glow: false,
      } satisfies Prisma.InputJsonValue,
    },
    create: {
      tenantId: demoTenant.id,
      appName: 'Maya Demo Salon',
      logoUrl: 'https://example.com/logo-demo-salon.png',
      primaryColor: '#111111',
      secondaryColor: '#C6A86A',
      backgroundImageUrl: 'https://example.com/bg-demo-salon.jpg',
      fontFamily: 'Manrope',
      buttonRadius: 18,
      themeJson: {
        appearance: 'premium-light',
        accent_glow: false,
      } satisfies Prisma.InputJsonValue,
    },
  });

  const demoBranchExisting = await prisma.branch.findFirst({
    where: {
      tenantId: demoTenant.id,
      name: 'Demo Main Branch',
    },
  });

  const demoBranch = demoBranchExisting
    ? await prisma.branch.update({
        where: { id: demoBranchExisting.id },
        data: {
          address: 'Moscow, Tverskaya 1',
          phone: '+79990000000',
          timezone: 'Europe/Moscow',
        },
      })
    : await prisma.branch.create({
        data: {
          tenantId: demoTenant.id,
          name: 'Demo Main Branch',
          address: 'Moscow, Tverskaya 1',
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
        dataset: 'demo-salon',
      } satisfies Prisma.InputJsonValue,
    },
    create: {
      tenantId: demoTenant.id,
      provider: 'mock',
      encryptedApiToken: encryptToken('mock-demo-token'),
      baseUrl: 'https://mock-crm.local',
      status: 'active',
      settingsJson: {
        dataset: 'demo-salon',
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
          password: platformOwnerPassword,
        },
        demo_tenant: {
          tenant_id: demoTenant.id,
          slug: demoTenant.slug,
          tenant_admin_user_id: tenantAdminId,
          tenant_admin_email: demoTenantAdminEmail,
          tenant_admin_password: demoTenantAdminPassword,
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
