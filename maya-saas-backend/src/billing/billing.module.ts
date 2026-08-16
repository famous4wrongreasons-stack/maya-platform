import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { BillingController } from './billing.controller';
import { BillingSchedulerService } from './billing-scheduler.service';
import { BillingService } from './billing.service';
import { BillingSystemGateway } from './billing-system.gateway';
import { YooKassaClientService } from './yookassa-client.service';

@Module({
  imports: [AuditLogModule, SubscriptionsModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    BillingSchedulerService,
    BillingSystemGateway,
    YooKassaClientService,
  ],
  exports: [BillingService],
})
export class BillingModule {}
