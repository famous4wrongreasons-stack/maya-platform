import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export const ACTIVE_MEMBERSHIP_STATUS = 'active';

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveMembership(userId: string, tenantId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_tenantId: {
          userId,
          tenantId,
        },
      },
      include: {
        tenant: true,
      },
    });

    if (
      !membership ||
      membership.status !== ACTIVE_MEMBERSHIP_STATUS ||
      !new Set(['trial', 'active', 'past_due']).has(membership.tenant.status)
    ) {
      throw new UnauthorizedException('Active tenant membership is required');
    }

    return membership;
  }
}
