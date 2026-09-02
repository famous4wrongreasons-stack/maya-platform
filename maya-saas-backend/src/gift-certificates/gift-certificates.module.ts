import { Module } from '@nestjs/common';

import { ActionEngineModule } from '../action-engine';
import { CrmModule } from '../crm/crm.module';
import { GiftCertificatePurchaseShadowController } from './gift-certificate-purchase-shadow.controller';
import { GiftCertificatePurchaseShadowService } from './gift-certificate-purchase-shadow.service';

@Module({
  imports: [ActionEngineModule, CrmModule],
  controllers: [GiftCertificatePurchaseShadowController],
  providers: [GiftCertificatePurchaseShadowService],
})
export class GiftCertificatesModule {}
