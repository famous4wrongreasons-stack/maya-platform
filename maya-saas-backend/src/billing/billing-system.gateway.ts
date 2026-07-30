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
