import { Module } from '@nestjs/common';

import { ActionEngineModule } from '../action-engine';
import { BillingModule } from '../billing/billing.module';
import { CrmModule } from '../crm/crm.module';
import { GiftCertificateActivationShadowController } from './gift-certificate-activation-shadow.controller';
import { GiftCertificateActivationShadowService } from './gift-certificate-activation-shadow.service';
import { GiftCertificatePurchaseShadowController } from './gift-certificate-purchase-shadow.controller';
import { GiftCertificatePurchaseShadowService } from './gift-certificate-purchase-shadow.service';

@Module({
  imports: [ActionEngineModule, BillingModule, CrmModule],
  controllers: [
    GiftCertificatePurchaseShadowController,
    GiftCertificateActivationShadowController,
  ],
  providers: [
    GiftCertificatePurchaseShadowService,
    GiftCertificateActivationShadowService,
  ],
})
export class GiftCertificatesModule {}
