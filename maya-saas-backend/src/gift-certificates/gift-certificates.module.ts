import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ActionEngineModule,
  ActionEngineRuntimeService,
} from '../action-engine';
import { BillingModule } from '../billing/billing.module';
import { CrmModule } from '../crm/crm.module';
import { PrismaService } from '../prisma/prisma.service';
import { GiftCertificateActivationShadowController } from './gift-certificate-activation-shadow.controller';
import { GiftCertificateActivationShadowService } from './gift-certificate-activation-shadow.service';
import { GiftCertificatePurchaseShadowController } from './gift-certificate-purchase-shadow.controller';
import { GiftCertificatePurchaseShadowService } from './gift-certificate-purchase-shadow.service';
import { GiftCertificateRedemptionShadowController } from './gift-certificate-redemption-shadow.controller';
import { GiftCertificateRedemptionShadowService } from './gift-certificate-redemption-shadow.service';
import { GiftCertificatePresentationService } from './gift-certificate-presentation.service';
import { P406GiftCertificateExecutableService } from './p4-06-gift-certificate-executable.service';
import {
  P406ActionProviderReferenceCodec,
  P406YooKassaCheckoutProvider,
} from './p4-06-yookassa-checkout-provider';

@Module({
  imports: [ActionEngineModule, BillingModule, CrmModule],
  controllers: [
    GiftCertificatePurchaseShadowController,
    GiftCertificateActivationShadowController,
    GiftCertificateRedemptionShadowController,
  ],
  providers: [
    GiftCertificatePurchaseShadowService,
    GiftCertificateActivationShadowService,
    GiftCertificateRedemptionShadowService,
    GiftCertificatePresentationService,
    P406YooKassaCheckoutProvider,
    {
      provide: P406ActionProviderReferenceCodec,
      useFactory: (config: ConfigService) =>
        new P406ActionProviderReferenceCodec(
          requiredActionSetting(config, 'ACTION_ENGINE_IDENTITY_SECRET'),
          requiredActionSetting(
            config,
            'ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET',
          ),
        ),
      inject: [ConfigService],
    },
    {
      provide: P406GiftCertificateExecutableService,
      useFactory: (
        prisma: PrismaService,
        actionEngine: ActionEngineRuntimeService,
        provider: P406YooKassaCheckoutProvider,
        providerReferenceCodec: P406ActionProviderReferenceCodec,
        config: ConfigService,
      ) =>
        new P406GiftCertificateExecutableService(prisma, actionEngine, {
          provider,
          providerReferenceCodec,
          presentationKey: requiredGiftCertificateSetting(
            config,
            'MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY',
          ),
          presentationKeyVersion: requiredGiftCertificateVersion(config),
          claimLookupKey: requiredGiftCertificateSetting(
            config,
            'MAYA_GIFT_CERTIFICATE_CLAIM_SECRET',
          ),
        }),
      inject: [
        PrismaService,
        ActionEngineRuntimeService,
        P406YooKassaCheckoutProvider,
        P406ActionProviderReferenceCodec,
        ConfigService,
      ],
    },
  ],
  exports: [
    GiftCertificatePresentationService,
    P406GiftCertificateExecutableService,
  ],
})
export class GiftCertificatesModule {}

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

function requiredGiftCertificateSetting(
  config: ConfigService,
  name:
    | 'MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY'
    | 'MAYA_GIFT_CERTIFICATE_CLAIM_SECRET',
): string {
  const value = config.get<string>(name)?.trim();
  if (!value || value.length < 32 || value.length > 256) {
    throw new Error(`${name} must contain from 32 to 256 characters`);
  }
  return value;
}

function requiredGiftCertificateVersion(config: ConfigService): string {
  const value = config
    .get<string>('MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION')
    ?.trim();
  if (!value || !/^[A-Za-z0-9._:-]{1,64}$/.test(value)) {
    throw new Error(
      'MAYA_GIFT_CERTIFICATE_PRESENTATION_KEY_VERSION is invalid',
    );
  }
  return value;
}
