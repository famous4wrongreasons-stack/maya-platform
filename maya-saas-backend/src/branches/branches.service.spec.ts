import { ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
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
    const prisma = {
      branch: {
        findMany: branchFindManyMock,
      },
    } as unknown as PrismaService;
    const tenantContext = new TenantContextService();

    return {
      service: new BranchesService(prisma, tenantContext),
      tenantContext,
      branchFindManyMock,
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
});
