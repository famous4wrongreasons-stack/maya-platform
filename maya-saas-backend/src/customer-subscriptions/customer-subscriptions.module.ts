import { Module } from '@nestjs/common';

import { ActionEngineModule } from '../action-engine';
import { BillingModule } from '../billing/billing.module';
import { CrmModule } from '../crm/crm.module';
import { CustomerSubscriptionActivationShadowController } from './customer-subscription-activation-shadow.controller';
import { CustomerSubscriptionActivationShadowService } from './customer-subscription-activation-shadow.service';
import { CustomerSubscriptionPurchaseShadowController } from './customer-subscription-purchase-shadow.controller';
import { CustomerSubscriptionPurchaseShadowService } from './customer-subscription-purchase-shadow.service';
import { CustomerSubscriptionRenewalShadowController } from './customer-subscription-renewal-shadow.controller';
import { CustomerSubscriptionRenewalShadowService } from './customer-subscription-renewal-shadow.service';

@Module({
  imports: [ActionEngineModule, BillingModule, CrmModule],
  controllers: [
    CustomerSubscriptionPurchaseShadowController,
    CustomerSubscriptionActivationShadowController,
    CustomerSubscriptionRenewalShadowController,
  ],
  providers: [
    CustomerSubscriptionPurchaseShadowService,
    CustomerSubscriptionActivationShadowService,
    CustomerSubscriptionRenewalShadowService,
  ],
})
export class CustomerSubscriptionsModule {}
