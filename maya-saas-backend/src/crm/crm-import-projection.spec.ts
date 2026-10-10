import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CrmProvider, UserRole } from '../common/domain.enums';
import type { EncryptionService } from '../encryption/encryption.service';
import type { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CrmService, type CrmImportPreview } from './crm.service';

const tenantId = 'synthetic-import-tenant';
const preview: CrmImportPreview = {
  provider: CrmProvider.YCLIENTS,
  company_id: 42,
  company: {
    id: '42',
    title: 'Synthetic salon',
    address: null,
    timezone: 'Europe/Berlin',
    logo_url: 'https://example.test/synthetic-logo.png',
    schedule: null,
  },
  services: { count: 0, items: [] },
  staff: { count: 0, items: [] },
  team: {
    count: 2,
    items: [
      {
        id: 'restored',
        name: 'Synthetic restored',
        bookable: true,
        suggested_role: 'staff',
      },
      {
        id: 'new',
        name: 'Synthetic new',
        bookable: true,
        suggested_role: 'staff',
      },
    ],
  },
  warnings: [],
};

function fixture(legacy = false) {
  const db = {
    crmIntegration: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ provider: CrmProvider.YCLIENTS }),
      update: jest.fn().mockResolvedValue({}),
    },
    crmStaffAccess: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'access-fired',
          externalStaffId: 'fired',
          userId: 'user-fired',
          role: UserRole.STAFF,
          status: 'active',
          title: null,
        },
        {
          id: 'access-restored',
          externalStaffId: 'restored',
          userId: 'user-restored',
          role: UserRole.STAFF,
          status: 'disabled',
          title: null,
        },
        {
          id: 'access-owner',
          externalStaffId: 'owner',
          userId: 'user-owner',
          role: UserRole.TENANT_OWNER,
          status: 'active',
          title: null,
        },
      ]),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
    staffProviderLink: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'link-fired',
          staffId: 'staff-fired',
          externalId: 'fired',
          unlinkedAt: null,
        },
        {
          id: 'link-restored',
          staffId: 'staff-restored',
          externalId: 'restored',
          unlinkedAt: null,
        },
      ]),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
    staff: { create: jest.fn().mockResolvedValue({ id: 'staff-new' }) },
    membership: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    authSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ defaultTimezone: 'UTC' }),
      update: jest.fn().mockResolvedValue({}),
    },
    branch: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    brandingSettings: {
      findUnique: jest.fn().mockResolvedValue({ logoUrl: null }),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const tx = db as unknown as Prisma.TransactionClient;
  const transaction = jest.fn(
    (run: (client: Prisma.TransactionClient) => Promise<void>) => run(tx),
  );
  const rootDb = legacy
    ? { ...db, $transaction: transaction }
    : new Proxy(
        { $transaction: transaction },
        {
          get(target, property) {
            if (property === '$transaction') return target.$transaction;
            throw new Error(
              `Unexpected root database access: ${String(property)}`,
            );
          },
        },
      );
  const createAdapter = jest.fn(() => {
    throw new Error('No provider access in import projection');
  });
  const tenantContext = new TenantContextService();
  const service = new CrmService(
    rootDb as unknown as PrismaService,
    {
      encrypt: (value: string) => `synthetic-encrypted:${value}`,
    } as unknown as EncryptionService,
    { create: createAdapter },
    tenantContext,
  );
  const apply = (requestedTenantId = tenantId) =>
    tenantContext.runAsSystemTenant(tenantId, () =>
      service.applyCanonicalImportProjection(
        requestedTenantId,
        preview,
        legacy ? undefined : tx,
      ),
    );
  return { db, transaction, createAdapter, apply };
}

describe('canonical import projection uses its caller transaction', () => {
  it('keeps every read/write on the supplied client, including access revocation and completion', async () => {
    const { db, transaction, createAdapter, apply } = fixture();
    await apply();

    expect(transaction).not.toHaveBeenCalled();
    expect(createAdapter).not.toHaveBeenCalled();
    expect(db.crmIntegration.findUnique).toHaveBeenCalledWith({
      where: { tenantId },
      select: { provider: true },
    });
    expect(db.staffProviderLink.findMany).toHaveBeenCalledWith({
      where: { tenantId, provider: CrmProvider.YCLIENTS },
      select: { id: true, staffId: true, externalId: true, unlinkedAt: true },
    });
    expect(db.membership.updateMany).toHaveBeenCalledWith({
      where: { tenantId, userId: 'user-fired', status: 'active' },
      data: { status: 'suspended' },
    });
    expect(db.membership.updateMany).toHaveBeenCalledWith({
      where: { tenantId, userId: 'user-restored', status: 'suspended' },
      data: { status: 'active' },
    });
    expect(db.membership.updateMany).toHaveBeenCalledTimes(2);
    expect(db.authSession.updateMany).toHaveBeenCalledTimes(1);
    expect(db.staffProviderLink.update).toHaveBeenCalledTimes(2);
    expect(db.staff.create).toHaveBeenCalledTimes(1);
    expect(db.staffProviderLink.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        staffId: 'staff-new',
        provider: CrmProvider.YCLIENTS,
        externalId: 'new',
      },
    });
    expect(db.crmStaffAccess.create).toHaveBeenCalledWith({
      data: {
        tenantId,
        staffId: 'staff-new',
        externalStaffId: 'new',
        encryptedDisplayName: 'synthetic-encrypted:Synthetic new',
        title: null,
        role: UserRole.STAFF,
        status: 'pending_contact',
      },
    });
    expect(db.branch.updateMany).toHaveBeenCalledWith({
      where: { tenantId, OR: [{ timezone: null }, { timezone: 'UTC' }] },
      data: { timezone: 'Europe/Berlin' },
    });
    expect(db.brandingSettings.upsert).toHaveBeenCalledTimes(1);
    expect(db.crmIntegration.update).toHaveBeenCalledTimes(1);
    expect(
      db.crmIntegration.update.mock.invocationCallOrder[0],
    ).toBeGreaterThan(db.brandingSettings.upsert.mock.invocationCallOrder[0]);
  });

  it.each([
    'team_read',
    'provider_read',
    'identity_write',
    'link_write',
    'grant_write',
    'session_revoke',
    'timezone_write',
    'branch_write',
    'branding_read',
    'branding_write',
    'completion_write',
  ] as const)(
    'propagates %s failure to the caller without falsely completing import',
    async (stage) => {
      const { db, transaction, apply } = fixture();
      const writes = {
        team_read: db.crmStaffAccess.findMany,
        provider_read: db.crmIntegration.findUnique,
        identity_write: db.staff.create,
        link_write: db.staffProviderLink.create,
        grant_write: db.crmStaffAccess.create,
        session_revoke: db.authSession.updateMany,
        timezone_write: db.tenant.update,
        branch_write: db.branch.updateMany,
        branding_read: db.brandingSettings.findUnique,
        branding_write: db.brandingSettings.upsert,
        completion_write: db.crmIntegration.update,
      };
      const failure = new Error(`synthetic-${stage}`);
      writes[stage].mockRejectedValueOnce(failure);
      await expect(apply()).rejects.toBe(failure);
      expect(transaction).not.toHaveBeenCalled();
      if (stage !== 'completion_write')
        expect(db.crmIntegration.update).not.toHaveBeenCalled();
      if (stage === 'timezone_write' || stage === 'branch_write')
        expect(db.brandingSettings.findUnique).not.toHaveBeenCalled();
    },
  );

  it('refuses a foreign tenant before touching the supplied client', async () => {
    const { db, transaction, apply } = fixture();
    await expect(apply('foreign-tenant')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(db.crmStaffAccess.findMany).not.toHaveBeenCalled();
    expect(db.crmIntegration.update).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('preserves legacy best-effort presentation refresh without a caller transaction', async () => {
    const { db, transaction, apply } = fixture(true);
    db.brandingSettings.upsert.mockRejectedValueOnce(
      new Error('synthetic-logo-failure'),
    );
    await expect(apply()).resolves.toBeUndefined();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(db.crmIntegration.update).toHaveBeenCalledTimes(1);
  });
});
