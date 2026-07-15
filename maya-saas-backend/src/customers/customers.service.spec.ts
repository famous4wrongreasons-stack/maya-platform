import { ForbiddenException } from '@nestjs/common';

import { AuditLogService } from '../audit-log/audit-log.service';
import { UserRole } from '../common/domain.enums';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UsersService } from '../users/users.service';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  const createService = () => {
    const tenantContext = new TenantContextService();
    let customerQueryTenantId: string | null = null;
    let membershipQueryTenantId: string | null = null;
    const userFindMany = jest.fn(
      (args: {
        where: {
          tenantId: string;
          memberships: { some: { tenantId: string; status: string } };
        };
      }) => {
        customerQueryTenantId = args.where.tenantId;
        membershipQueryTenantId = args.where.memberships.some.tenantId;
        return Promise.resolve([
          {
            id: 'client-a',
            tenantId: 'tenant-a',
            role: UserRole.CLIENT,
            customerProfile: null,
            loyaltyAccount: { balance: 2133, source: 'yclients' },
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

    return {
      tenantContext,
      userFindMany,
      getTenantUserOrThrowMock,
      getCustomerQueryTenantId: () => customerQueryTenantId,
      getMembershipQueryTenantId: () => membershipQueryTenantId,
      service: new CustomersService(
        prisma,
        tenantContext,
        usersService,
        encryptionService,
        auditLogService,
      ),
    };
  };

  it('lists only active customer memberships from the current tenant', async () => {
    const setup = createService();

    const result = await setup.tenantContext.runAsSystemTenant('tenant-a', () =>
      setup.service.listCustomers('tenant-a', 50),
    );

    expect(setup.getCustomerQueryTenantId()).toBe('tenant-a');
    expect(setup.getMembershipQueryTenantId()).toBe('tenant-a');
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
