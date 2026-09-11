import { ForbiddenException } from '@nestjs/common';

import { AuditLogService } from '../audit-log/audit-log.service';
import { UserRole } from '../common/domain.enums';
import { EncryptionService } from '../encryption/encryption.service';
import { snapshotAuthorityView } from '../domain';
import type { LoyaltyService } from '../loyalty/loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UsersService } from '../users/users.service';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  const createService = () => {
    const tenantContext = new TenantContextService();
    let membershipQueryTenantId: string | null = null;
    const userFindMany = jest.fn(
      (args: {
        where: {
          memberships: {
            some: {
              tenantId: string;
              status: string;
              role: { in: UserRole[] };
            };
          };
        };
      }) => {
        membershipQueryTenantId = args.where.memberships.some.tenantId;
        return Promise.resolve([
          {
            id: 'client-a',
            tenantId: 'stale-tenant',
            role: UserRole.TENANT_ADMIN,
            memberships: [
              {
                tenantId: 'tenant-a',
                branchId: null,
                role: UserRole.CLIENT,
                status: 'active',
              },
            ],
            customerProfiles: [],
            loyaltyAccounts: [{ balance: 2133, source: 'yclients' }],
            _count: { appointments: 39 },
          },
        ]);
      },
    );
    const getTenantUserOrThrowMock = jest.fn().mockResolvedValue({
      id: 'client-a',
      tenantId: 'tenant-a',
      role: UserRole.CLIENT,
    });
    const prisma = {
      user: { findMany: userFindMany },
      customerProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
      loyaltyAccount: { findUnique: jest.fn().mockResolvedValue(null) },
      appointment: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as PrismaService;
    const usersService = {
      getTenantUserOrThrow: getTenantUserOrThrowMock,
      serializeUser: jest.fn().mockReturnValue({
        id: 'client-a',
        tenant_id: 'tenant-a',
        role: UserRole.CLIENT,
      }),
    } as unknown as UsersService;
    const encryptionService = {
      encrypt: jest.fn((value: string) => `encrypted:${value}`),
      decrypt: jest.fn((value: string) => value.replace('encrypted:', '')),
    } as unknown as EncryptionService;
    const auditLogService = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditLogService;
    // 🔴 P7.1. Раньше сервис строился ПЯТЬЮ аргументами при шести обязательных:
    // спеки не проходят проверку типов, поэтому ошибка не всплывала, а
    // `loyaltyService` в тестах был `undefined`. Тест списка клиентов из-за
    // этого закреплял как норму обход границы лояльности.
    const authoritySnapshotMock: jest.MockedFunction<
      LoyaltyService['authoritySnapshot']
    > = jest.fn().mockResolvedValue(snapshotAuthorityView('legacy_bot'));
    const loyaltyService: Pick<LoyaltyService, 'authoritySnapshot'> = {
      authoritySnapshot: authoritySnapshotMock,
    };
    const canonicalWave3 = {} as never;
    const clientIdentity = {
      ensureFirstPartyClient: jest.fn(),
    };

    return {
      tenantContext,
      userFindMany,
      getTenantUserOrThrowMock,
      authoritySnapshotMock,
      getMembershipQueryTenantId: () => membershipQueryTenantId,
      service: new CustomersService(
        prisma,
        tenantContext,
        usersService,
        encryptionService,
        auditLogService,
        loyaltyService as LoyaltyService,
        canonicalWave3,
        clientIdentity as never,
      ),
    };
  };

  it('🔴 владелец лояльности в списке приходит из границы, а не второй формулы', async () => {
    // P7.1. До правки список выводил владельца сам — из колонки кэша. Одна и та
    // же строка получала в списке одного владельца, а в карточке другого.
    const setup = createService();

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.listCustomers('tenant-a', 50),
    );

    expect(setup.authoritySnapshotMock).toHaveBeenCalledTimes(1);
    expect(setup.authoritySnapshotMock).toHaveBeenCalledWith('tenant-a');
    expect(result[0]).toMatchObject({
      loyalty_authority: 'legacy_bot',
      // Снимок назван снимком: к владельцу за этой строкой не ходили.
      loyalty_authority_scope: 'configured',
      loyalty_sync_status: 'list_snapshot',
      loyalty_stale: true,
      loyalty_verification_required: true,
    });
  });

  it('lists only active customer memberships from the current tenant', async () => {
    const setup = createService();

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.listCustomers('tenant-a', 50),
    );

    expect(setup.getMembershipQueryTenantId()).toBe('tenant-a');
    expect(setup.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          memberships: {
            some: {
              tenantId: 'tenant-a',
              status: 'active',
              role: { in: [UserRole.CLIENT, UserRole.CUSTOMER] },
            },
          },
        },
      }),
    );
    expect(setup.userFindMany.mock.calls[0]?.[0]?.where).not.toHaveProperty(
      'tenantId',
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 'client-a',
        tenant_id: 'tenant-a',
        appointments_count: 39,
        loyalty_balance: 2133,
        loyalty_source: 'yclients',
      }),
    ]);
  });

  it('rejects a tenant mismatch before querying customer records', async () => {
    const setup = createService();

    await expect(
      setup.tenantContext.runAsSystemTenant('tenant-a', () =>
        setup.service.listCustomers('tenant-b', 50),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(setup.userFindMany).not.toHaveBeenCalled();
    expect(setup.getTenantUserOrThrowMock).not.toHaveBeenCalled();
  });
});
