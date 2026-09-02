import { Injectable } from '@nestjs/common';

import { TenantStatus } from '../common/domain.enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BillingSystemGateway {
  constructor(private readonly prisma: PrismaService) {}

  findPaymentByProviderPaymentId(providerPaymentId: string) {
    return this.prisma.billingPayment.findUnique({
      where: { providerPaymentId },
    });
  }

  /**
   * Платежи, которые у нас «в ожидании», но уже имеют номер в банке.
   *
   * Системный шлюз: сверка идёт мимо тенант-скоупа, потому что проверяем всю
   * платформу разом. Тенант подставляется при применении каждого платежа.
   */
  listPendingPayments(olderThan: Date) {
    return this.prisma.billingPayment.findMany({
      where: {
        status: 'pending',
        createdAt: { lt: olderThan },
      },
      include: { actionExecution: true },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  }

  getBillingCandidate(tenantId: string) {
    return this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true },
    });
  }

  listBillingCandidates(now: Date, take: number) {
    return this.prisma.tenant.findMany({
      where: {
        OR: [
          {
            status: { in: [TenantStatus.ACTIVE, TenantStatus.TRIAL] },
            OR: [
              { currentPeriodEnd: { lte: now } },
              { currentPeriodEnd: null, trialEndsAt: { lte: now } },
            ],
          },
          {
            status: TenantStatus.PAST_DUE,
            billingMethodId: { not: null },
            planId: { not: null },
            OR: [
              { currentPeriodEnd: { lte: now } },
              { currentPeriodEnd: null, trialEndsAt: { lte: now } },
            ],
          },
        ],
        billingPayments: { none: { status: 'pending' } },
      },
      include: { plan: true },
      orderBy: { id: 'asc' },
      take,
    });
  }
}
