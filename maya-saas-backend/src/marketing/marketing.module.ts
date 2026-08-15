import { Module } from '@nestjs/common';

import { CrmModule } from '../crm/crm.module';
import { InboxModule } from '../inbox/inbox.module';
import { RecoveryModule } from '../recovery/recovery.module';
import { MarketingService } from './marketing.service';

@Module({
  imports: [CrmModule, InboxModule, RecoveryModule],
  providers: [MarketingService],
  exports: [MarketingService],
})
export class MarketingModule {}
