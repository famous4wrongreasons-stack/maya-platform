import { Module } from '@nestjs/common';

import { BusinessFactsModule } from '../business-facts/business-facts.module';
import { CommunicationDeliveryModule } from '../communication-delivery/communication-delivery.module';
import { CommunicationShadowModule } from '../communication-shadow';
import { CrmModule } from '../crm/crm.module';
import { RecoveryModule } from '../recovery/recovery.module';
import { MarketingService } from './marketing.service';

@Module({
  imports: [
    BusinessFactsModule,
    CommunicationDeliveryModule,
    CommunicationShadowModule,
    CrmModule,
    RecoveryModule,
  ],
  providers: [MarketingService],
  exports: [MarketingService],
})
export class MarketingModule {}
