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
        update: { balance?: number };
      }) => {
        upsertTenantId = args.where.userId_tenantId.tenantId;
        upsertUserId = args.where.userId_tenantId.userId;
        upsertBalance = args.update.balance;
        return Promise.resolve({
          id: 'account-a',
          tenantId: 'tenant-a',
          userId: 'client-a',
          source: CrmProvider.YCLIENTS,
          balance: 2133,
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
    const prisma = {
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
    });
    expect(setup.getUpsertTenantId()).toBe('tenant-a');
    expect(setup.getUpsertUserId()).toBe('client-a');
    expect(setup.getUpsertBalance()).toBe(2133);
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
