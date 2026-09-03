import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ActionEngineModule,
  ActionEngineRuntimeService,
} from '../action-engine';
import { BillingModule } from '../billing/billing.module';
import { BusinessContentModule } from '../business-content/business-content.module';
import { CrmModule } from '../crm/crm.module';
import { PrismaService } from '../prisma/prisma.service';
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
import { P405CustomerSubscriptionExecutableService } from './p4-05-customer-subscription-executable.service';
import {
  P405ActionProviderReferenceCodec,
  P405YooKassaCheckoutProvider,
} from './p4-05-yookassa-checkout-provider';

@Module({
  imports: [
    ActionEngineModule,
    BillingModule,
    CrmModule,
    BusinessContentModule,
  ],
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
    P405YooKassaCheckoutProvider,
    {
      provide: P405ActionProviderReferenceCodec,
      useFactory: (config: ConfigService) =>
        new P405ActionProviderReferenceCodec(
          requiredActionSetting(config, 'ACTION_ENGINE_IDENTITY_SECRET'),
          requiredActionSetting(
            config,
            'ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET',
          ),
        ),
      inject: [ConfigService],
    },
    {
      provide: P405CustomerSubscriptionExecutableService,
      useFactory: (
        prisma: PrismaService,
        actionEngine: ActionEngineRuntimeService,
        provider: P405YooKassaCheckoutProvider,
        providerReferenceCodec: P405ActionProviderReferenceCodec,
      ) =>
        new P405CustomerSubscriptionExecutableService(prisma, actionEngine, {
          provider,
          providerReferenceCodec,
        }),
      inject: [
        PrismaService,
        ActionEngineRuntimeService,
        P405YooKassaCheckoutProvider,
        P405ActionProviderReferenceCodec,
      ],
    },
  ],
  exports: [P405CustomerSubscriptionExecutableService],
})
export class CustomerSubscriptionsModule {}

function requiredActionSetting(
  config: ConfigService,
  name:
    'ACTION_ENGINE_IDENTITY_SECRET' | 'ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET',
): string {
  const value =
    config.get<string>(name)?.trim() ??
    config.get<string>('CRM_ENCRYPTION_KEY')?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
