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
import { CustomerSubscriptionExpiryShadowController } from './customer-subscription-expiry-shadow.controller';
import { CustomerSubscriptionExpiryShadowService } from './customer-subscription-expiry-shadow.service';
import { CustomerSubscriptionCancellationShadowController } from './customer-subscription-cancellation-shadow.controller';
import { CustomerSubscriptionCancellationShadowService } from './customer-subscription-cancellation-shadow.service';
import { CustomerSubscriptionRevocationShadowController } from './customer-subscription-revocation-shadow.controller';
import { CustomerSubscriptionRevocationShadowService } from './customer-subscription-revocation-shadow.service';

@Module({
  imports: [ActionEngineModule, BillingModule, CrmModule],
  controllers: [
    CustomerSubscriptionPurchaseShadowController,
    CustomerSubscriptionActivationShadowController,
    CustomerSubscriptionRenewalShadowController,
    CustomerSubscriptionRenewalActivationShadowController,
    CustomerSubscriptionUsageShadowController,
    CustomerSubscriptionExpiryShadowController,
    CustomerSubscriptionCancellationShadowController,
    CustomerSubscriptionRevocationShadowController,
  ],
  providers: [
    CustomerSubscriptionPurchaseShadowService,
    CustomerSubscriptionActivationShadowService,
    CustomerSubscriptionRenewalShadowService,
    CustomerSubscriptionRenewalActivationShadowService,
    CustomerSubscriptionUsageShadowService,
    CustomerSubscriptionExpiryShadowService,
    CustomerSubscriptionCancellationShadowService,
    CustomerSubscriptionRevocationShadowService,
  ],
})
export class CustomerSubscriptionsModule {}
