import { ConflictException, ForbiddenException } from '@nestjs/common';

import { AuditLogService } from '../audit-log/audit-log.service';
import { CalendarSource, CrmProvider } from '../common/domain.enums';
import { CrmService } from '../crm/crm.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UsersService } from '../users/users.service';
import { LoyaltyService } from './loyalty.service';

describe('LoyaltyService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    delete process.env.MAYA_LEGACY_BRIDGE_TOKEN;
    delete process.env.MAYA_LEGACY_BRIDGE_URL;
    delete process.env.MAYA_LEGACY_LOYALTY_TENANT_SLUGS;
    delete process.env.MAYA_LEGACY_LOYALTY_COMPANY_IDS;
    global.fetch = originalFetch;
  });

  const createService = () => {
    const tenantContext = new TenantContextService();
    const loyaltyFindUniqueMock = jest.fn().mockResolvedValue(null);
    let upsertTenantId: string | null = null;
    let upsertUserId: string | null = null;
    let upsertBalance: number | undefined;
    const loyaltyUpsertMock = jest.fn(
      (args: {
        where: {
          userId_tenantId: { userId: string; tenantId: string };
        };
        update: { balance?: number; source?: string };
      }) => {
        upsertTenantId = args.where.userId_tenantId.tenantId;
        upsertUserId = args.where.userId_tenantId.userId;
        upsertBalance = args.update.balance;
        return Promise.resolve({
          id: 'account-a',
          tenantId: 'tenant-a',
          userId: 'client-a',
          source: args.update.source || CrmProvider.YCLIENTS,
          balance: args.update.balance ?? 2133,
          externalReference: 'card-a',
          syncedAt: new Date('2026-07-15T10:00:00.000Z'),
        });
      },
    );
    const getTenantUserOrThrowMock = jest.fn().mockResolvedValue({
      id: 'client-a',
      phone: '+79184172035',
    });
    const getCalendarSourceMock = jest
      .fn()
      .mockResolvedValue(CalendarSource.EXTERNAL);
    const getClientLoyaltyMock = jest.fn().mockResolvedValue({
      provider: CrmProvider.YCLIENTS,
      external_client_id: 'client-external-a',
      external_card_id: 'card-a',
      balance: 2133,
      sold_amount: 62150,
      currency: 'RUB',
    });
    const getServicesMock = jest.fn().mockResolvedValue([
      {
        id: 'service-massage',
        name: 'Массаж',
        price: 450,
        duration_minutes: 20,
        currency: 'RUB',
      },
      {
        id: 'service-spa',
        name: 'SPA для лица',
        price: 1200,
        duration_minutes: 40,
        currency: 'RUB',
      },
      {
        id: 'service-premium',
        name: 'Премиальный комплекс',
        price: 2500,
        duration_minutes: 90,
        currency: 'RUB',
      },
    ]);
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      authIdentity: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      loyaltyAccount: {
        findUnique: loyaltyFindUniqueMock,
        upsert: loyaltyUpsertMock,
      },
      loyaltyTransaction: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const usersService = {
      getTenantUserOrThrow: getTenantUserOrThrowMock,
    } as unknown as UsersService;
    const crmService = {
      getCalendarSource: getCalendarSourceMock,
      getClientLoyalty: getClientLoyaltyMock,
      getServices: getServicesMock,
    } as unknown as CrmService;
    const encryptionService = {
      encrypt: jest.fn((value: string) => `encrypted:${value}`),
      decrypt: jest.fn((value: string) => value.replace('encrypted:', '')),
    } as unknown as EncryptionService;
    const auditLogService = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditLogService;

    return {
      tenantContext,
      prisma,
      usersService,
      crmService,
      encryptionService,
      auditLogService,
      loyaltyFindUniqueMock,
      loyaltyUpsertMock,
      getTenantUserOrThrowMock,
      getCalendarSourceMock,
      getClientLoyaltyMock,
      getServicesMock,
      tenantFindUniqueMock: (
        prisma as unknown as {
          tenant: { findUnique: jest.Mock };
        }
      ).tenant.findUnique,
      authIdentityFindFirstMock: (
        prisma as unknown as {
          authIdentity: { findFirst: jest.Mock };
        }
      ).authIdentity.findFirst,
      getUpsertTenantId: () => upsertTenantId,
      getUpsertUserId: () => upsertUserId,
      getUpsertBalance: () => upsertBalance,
      service: new LoyaltyService(
        prisma,
        tenantContext,
        usersService,
        crmService,
        encryptionService,
        auditLogService,
      ),
    };
  };

  it('stores and returns the exact external CRM balance', async () => {
    const setup = createService();

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getForUser('tenant-a', 'client-a'),
    );

    expect(result).toMatchObject({
      balance: 2133,
      source: CrmProvider.YCLIENTS,
      authoritative: 'crm',
      sync_status: 'current',
      stale: false,
      sold_amount: 62150,
      spend_options: {
        status: 'available',
        verification_required: true,
        best_service: {
          id: 'service-spa',
          points_required: 1200,
        },
        next_service: {
          id: 'service-premium',
          points_needed: 367,
        },
      },
    });
    expect(setup.getUpsertTenantId()).toBe('tenant-a');
    expect(setup.getUpsertUserId()).toBe('client-a');
    expect(setup.getUpsertBalance()).toBe(2133);
  });

  it('uses the existing MAYA ledger for a configured migrated tenant', async () => {
    const setup = createService();
    process.env.MAYA_LEGACY_BRIDGE_TOKEN = 'x'.repeat(48);
    process.env.MAYA_LEGACY_BRIDGE_URL =
      'http://127.0.0.1:8080/api/internal/loyalty-snapshot';
    process.env.MAYA_LEGACY_LOYALTY_TENANT_SLUGS = 'tenant-a-slug';
    setup.tenantFindUniqueMock.mockResolvedValueOnce({ slug: 'tenant-a-slug' });
    setup.authIdentityFindFirstMock.mockResolvedValueOnce({
      providerUserId: '987654321',
    });
    const fetchMock: jest.MockedFunction<typeof fetch> = jest
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            found: true,
            balance: 385,
            source: 'maya_ledger',
          }),
          { status: 200 },
        ),
      );
    global.fetch = fetchMock;

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getForUser('tenant-a', 'client-a'),
    );

    expect(result).toMatchObject({
      balance: 385,
      source: 'legacy_maya',
      authoritative: 'maya',
      sync_status: 'current',
      stale: false,
    });
    expect(setup.getClientLoyaltyMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(requestUrl).toEqual(
      new URL('http://127.0.0.1:8080/api/internal/loyalty-snapshot'),
    );
    expect(requestInit?.method).toBe('POST');
    expect(new Headers(requestInit?.headers).get('X-Maya-Legacy-Bridge')).toBe(
      'x'.repeat(48),
    );
  });

  it('uses the existing MAYA ledger after the CRM branch is re-registered', async () => {
    const setup = createService();
    process.env.MAYA_LEGACY_BRIDGE_TOKEN = 'x'.repeat(48);
    process.env.MAYA_LEGACY_BRIDGE_URL =
      'http://127.0.0.1:8080/api/internal/loyalty-snapshot';
    process.env.MAYA_LEGACY_LOYALTY_COMPANY_IDS = '503759';
    setup.tenantFindUniqueMock.mockResolvedValueOnce({
      slug: 'new-registration-slug',
      crmIntegration: { settingsJson: { companyId: 503759 } },
    });
    setup.authIdentityFindFirstMock.mockResolvedValueOnce({
      providerUserId: '987654321',
    });
    const fetchMock: jest.MockedFunction<typeof fetch> = jest
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            found: true,
            balance: 385,
            source: 'maya_ledger',
          }),
          { status: 200 },
        ),
      );
    global.fetch = fetchMock;

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getForUser('tenant-a', 'client-a'),
    );

    expect(result).toMatchObject({
      balance: 385,
      source: 'legacy_maya',
      authoritative: 'maya',
      sync_status: 'current',
      stale: false,
    });
    expect(setup.getClientLoyaltyMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not expose the legacy ledger to another CRM branch', async () => {
    const setup = createService();
    process.env.MAYA_LEGACY_BRIDGE_TOKEN = 'x'.repeat(48);
    process.env.MAYA_LEGACY_LOYALTY_COMPANY_IDS = '503759';
    setup.tenantFindUniqueMock.mockResolvedValueOnce({
      slug: 'another-salon',
      crmIntegration: { settingsJson: { companyId: 999999 } },
    });
    const fetchMock: jest.MockedFunction<typeof fetch> = jest.fn();
    global.fetch = fetchMock;

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getForUser('tenant-a', 'client-a'),
    );

    expect(result).toMatchObject({
      balance: 2133,
      source: CrmProvider.YCLIENTS,
      authoritative: 'crm',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not present a missing external card as a confirmed zero balance', async () => {
    const setup = createService();
    setup.getClientLoyaltyMock.mockResolvedValueOnce(null);

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getForUser('tenant-a', 'client-a'),
    );

    expect(result).toMatchObject({
      balance: null,
      authoritative: 'crm',
      sync_status: 'card_not_found',
      stale: false,
      spend_options: { status: 'balance_unavailable' },
    });
    expect(setup.loyaltyUpsertMock).not.toHaveBeenCalled();
  });

  it('keeps the confirmed balance available when the service catalog fails', async () => {
    const setup = createService();
    setup.getServicesMock.mockRejectedValueOnce(new Error('Catalog timeout'));

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getForUser('tenant-a', 'client-a'),
    );

    expect(result).toMatchObject({
      balance: 2133,
      authoritative: 'crm',
      spend_options: {
        status: 'catalog_unavailable',
        items: [],
      },
    });
  });

  it('returns a cached CRM balance as stale instead of inventing zero', async () => {
    const setup = createService();
    setup.loyaltyFindUniqueMock.mockResolvedValueOnce({
      id: 'account-a',
      tenantId: 'tenant-a',
      userId: 'client-a',
      source: CrmProvider.YCLIENTS,
      balance: 2133,
      externalReference: 'card-a',
      syncedAt: new Date('2026-07-15T09:00:00.000Z'),
      createdAt: new Date('2026-07-15T09:00:00.000Z'),
      updatedAt: new Date('2026-07-15T09:00:00.000Z'),
    });
    setup.getClientLoyaltyMock.mockRejectedValueOnce(new Error('CRM timeout'));

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.getForUser('tenant-a', 'client-a'),
    );

    expect(result).toMatchObject({
      balance: 2133,
      authoritative: 'crm',
      sync_status: 'temporarily_unavailable',
      stale: true,
    });
    expect(setup.loyaltyUpsertMock).not.toHaveBeenCalled();
  });

  it('keeps external CRM balances read-only', async () => {
    const setup = createService();

    await expect(
      setup.tenantContext.runAsSystemTenant('tenant-a', () =>
        setup.service.adjustInternalBalance({
          tenantId: 'tenant-a',
          targetUserId: 'client-a',
          actorUserId: 'owner-a',
          dto: {
            delta: 100,
            reason: 'Manual correction',
            idempotencyKey: '2cedf552-132a-4ca9-a2bb-a0a4d59b3928',
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(setup.getTenantUserOrThrowMock).not.toHaveBeenCalled();
  });

  it('rejects a tenant mismatch before loading CRM or user data', async () => {
    const setup = createService();

    await expect(
      setup.tenantContext.runAsSystemTenant('tenant-a', () =>
        setup.service.getForUser('tenant-b', 'client-a'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(setup.getCalendarSourceMock).not.toHaveBeenCalled();
    expect(setup.getTenantUserOrThrowMock).not.toHaveBeenCalled();
  });
});
