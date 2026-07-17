import { ConflictException, ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from '../quotas/quota.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { BranchesService } from './branches.service';

describe('BranchesService tenant isolation', () => {
  const createService = () => {
    const branchFindManyMock = jest.fn().mockResolvedValue([
      {
        id: 'branch-a',
        tenantId: 'tenant-a',
        name: 'Tenant A branch',
        address: null,
        phone: null,
        timezone: 'Europe/Moscow',
        createdAt: new Date('2026-07-11T10:00:00.000Z'),
        updatedAt: new Date('2026-07-11T10:00:00.000Z'),
      },
    ]);
    const branchCreateMock = jest.fn().mockResolvedValue({
      id: 'branch-b',
      tenantId: 'tenant-a',
      name: 'Second branch',
      address: null,
      phone: null,
      timezone: 'Europe/Moscow',
      createdAt: new Date('2026-07-17T10:00:00.000Z'),
      updatedAt: new Date('2026-07-17T10:00:00.000Z'),
    });
    const assertCanCreateMock = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      branch: {
        findMany: branchFindManyMock,
        create: branchCreateMock,
      },
    } as unknown as PrismaService;
    const tenantContext = new TenantContextService();

    return {
      service: new BranchesService(prisma, tenantContext, {
        assertCanCreate: assertCanCreateMock,
      } as unknown as QuotaService),
      tenantContext,
      branchFindManyMock,
      branchCreateMock,
      assertCanCreateMock,
    };
  };

  it('queries branches with the tenant confirmed by request context', async () => {
    const { service, tenantContext, branchFindManyMock } = createService();

    const result = await tenantContext.runAsSystemTenant('tenant-a', () =>
      service.listForTenant('tenant-a'),
    );

    expect(branchFindManyMock).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      orderBy: { createdAt: 'asc' },
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: 'branch-a',
        tenant_id: 'tenant-a',
      }),
    ]);
  });

  it('rejects a foreign tenant before querying branches', async () => {
    const { service, tenantContext, branchFindManyMock } = createService();

    await expect(
      tenantContext.runAsSystemTenant('tenant-a', () =>
        service.listForTenant('tenant-b'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(branchFindManyMock).not.toHaveBeenCalled();
  });

  it('fails closed without tenant context', async () => {
    const { service, branchFindManyMock } = createService();

    await expect(service.listForTenant('tenant-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(branchFindManyMock).not.toHaveBeenCalled();
  });

  it('checks the plan quota before creating a tenant-scoped branch', async () => {
    const { service, tenantContext, branchCreateMock, assertCanCreateMock } =
      createService();

    const result = await tenantContext.runAsSystemTenant('tenant-a', () =>
      service.createForTenant('tenant-a', {
        name: ' Second branch ',
        timezone: 'Europe/Moscow',
      }),
    );

    expect(assertCanCreateMock).toHaveBeenCalledWith('tenant-a', 'branches');
    expect(branchCreateMock).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-a',
        name: 'Second branch',
        address: null,
        phone: null,
        timezone: 'Europe/Moscow',
      },
    });
    expect(result).toMatchObject({ id: 'branch-b', tenant_id: 'tenant-a' });
  });

  it('does not create a branch when the quota service soft-blocks it', async () => {
    const { service, tenantContext, branchCreateMock, assertCanCreateMock } =
      createService();
    assertCanCreateMock.mockRejectedValue(
      new ConflictException({ error: { code: 'quota_exceeded' } }),
    );

    await expect(
      tenantContext.runAsSystemTenant('tenant-a', () =>
        service.createForTenant('tenant-a', { name: 'Blocked branch' }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(branchCreateMock).not.toHaveBeenCalled();
  });
});
