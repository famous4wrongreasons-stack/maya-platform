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
import { CustomerSubscriptionRenewalActivationShadowController } from './customer-subscription-renewal-activation-shadow.controller';
import { CustomerSubscriptionRenewalActivationShadowService } from './customer-subscription-renewal-activation-shadow.service';
import { CustomerSubscriptionUsageShadowController } from './customer-subscription-usage-shadow.controller';
import { CustomerSubscriptionUsageShadowService } from './customer-subscription-usage-shadow.service';

@Module({
  imports: [ActionEngineModule, BillingModule, CrmModule],
  controllers: [
    CustomerSubscriptionPurchaseShadowController,
    CustomerSubscriptionActivationShadowController,
    CustomerSubscriptionRenewalShadowController,
    CustomerSubscriptionRenewalActivationShadowController,
    CustomerSubscriptionUsageShadowController,
  ],
  providers: [
    CustomerSubscriptionPurchaseShadowService,
    CustomerSubscriptionActivationShadowService,
    CustomerSubscriptionRenewalShadowService,
    CustomerSubscriptionRenewalActivationShadowService,
    CustomerSubscriptionUsageShadowService,
  ],
})
export class CustomerSubscriptionsModule {}
