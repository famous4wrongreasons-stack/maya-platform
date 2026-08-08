import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthFlowSystemGateway {
  constructor(private readonly prisma: PrismaService) {}

  findByState(state: string) {
    return this.prisma.authFlowState.findUnique({
      where: { state },
      include: {
        tenant: {
          select: {
            id: true,
            slug: true,
            status: true,
            allowSelfRegistration: true,
            // Needed for trial client signup + internal-calendar phone policy.
            trialFullAccess: true,
            trialEndsAt: true,
            currentPeriodEnd: true,
            calendarSource: true,
          },
        },
      },
    });
  }
}
