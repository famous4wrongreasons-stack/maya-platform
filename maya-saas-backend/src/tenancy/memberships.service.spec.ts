import { UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { MembershipsService } from './memberships.service';

describe('MembershipsService', () => {
  it('returns an active membership for an accessible tenant', async () => {
    const membership = {
      id: 'membership-a',
      userId: 'user-a',
      tenantId: 'tenant-a',
      role: 'tenant_admin',
      status: 'active',
      tenant: { status: 'active' },
      branch: { id: 'branch-a' },
    };
    const findUnique = jest.fn().mockResolvedValue(membership);
    const prisma = {
      membership: {
        findUnique,
      },
    } as unknown as PrismaService;

    await expect(
      new MembershipsService(prisma).getActiveMembership('user-a', 'tenant-a'),
    ).resolves.toBe(membership);
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        userId_tenantId: { userId: 'user-a', tenantId: 'tenant-a' },
      },
      include: { tenant: true, branch: true },
    });
  });

  it('rejects a suspended membership', async () => {
    const prisma = {
      membership: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'membership-a',
          status: 'suspended',
          tenant: { status: 'active' },
        }),
      },
    } as unknown as PrismaService;

    await expect(
      new MembershipsService(prisma).getActiveMembership('user-a', 'tenant-a'),
    ).rejects.toThrow(UnauthorizedException);
  });
});
