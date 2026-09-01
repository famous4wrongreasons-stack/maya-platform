import { Module } from '@nestjs/common';

import { ActionEngineModule } from '../action-engine';
import { CrmModule } from '../crm/crm.module';
import { CustomerSubscriptionPurchaseShadowController } from './customer-subscription-purchase-shadow.controller';
import { CustomerSubscriptionPurchaseShadowService } from './customer-subscription-purchase-shadow.service';

@Module({
  imports: [ActionEngineModule, CrmModule],
  controllers: [CustomerSubscriptionPurchaseShadowController],
  providers: [CustomerSubscriptionPurchaseShadowService],
})
export class CustomerSubscriptionsModule {}
