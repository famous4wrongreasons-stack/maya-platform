import { Module } from '@nestjs/common';

import { BusinessFactsModule } from '../business-facts/business-facts.module';
import { CrmModule } from '../crm/crm.module';
import { InboxModule } from '../inbox/inbox.module';
import { RecoveryModule } from '../recovery/recovery.module';
import { MarketingService } from './marketing.service';

@Module({
  imports: [BusinessFactsModule, CrmModule, InboxModule, RecoveryModule],
  providers: [MarketingService],
  exports: [MarketingService],
})
export class MarketingModule {}
