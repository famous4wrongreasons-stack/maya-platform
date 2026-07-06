import { Module } from '@nestjs/common';

import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { YooKassaClientService } from './yookassa-client.service';

@Module({
  imports: [SubscriptionsModule],
  controllers: [BillingController],
  providers: [BillingService, YooKassaClientService],
  exports: [BillingService],
})
export class BillingModule {}
