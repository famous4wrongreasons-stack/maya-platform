import { Module } from '@nestjs/common';

import { ActionEngineModule } from '../action-engine';
import { BillingModule } from '../billing/billing.module';
import { CrmModule } from '../crm/crm.module';
import { CustomerSubscriptionActivationShadowController } from './customer-subscription-activation-shadow.controller';
import { CustomerSubscriptionActivationShadowService } from './customer-subscription-activation-shadow.service';
import { CustomerSubscriptionPurchaseShadowController } from './customer-subscription-purchase-shadow.controller';
import { CustomerSubscriptionPurchaseShadowService } from './customer-subscription-purchase-shadow.service';

@Module({
  imports: [ActionEngineModule, BillingModule, CrmModule],
  controllers: [
    CustomerSubscriptionPurchaseShadowController,
    CustomerSubscriptionActivationShadowController,
  ],
  providers: [
    CustomerSubscriptionPurchaseShadowService,
    CustomerSubscriptionActivationShadowService,
  ],
})
export class CustomerSubscriptionsModule {}
