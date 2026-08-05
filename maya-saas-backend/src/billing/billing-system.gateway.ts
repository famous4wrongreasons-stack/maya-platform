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
        providerPaymentId: { not: null },
        createdAt: { lt: olderThan },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  }

  listBillingCandidates() {
    return this.prisma.tenant.findMany({
      where: {
        status: {
          in: [TenantStatus.ACTIVE, TenantStatus.TRIAL, TenantStatus.PAST_DUE],
        },
      },
      include: { plan: true },
    });
  }
}
