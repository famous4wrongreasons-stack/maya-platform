import { Module } from '@nestjs/common';

import { ActionEngineModule } from '../action-engine';
import { CrmModule } from '../crm/crm.module';
import { ReferralCreateShadowController } from './referral-create-shadow.controller';
import { ReferralCreateShadowService } from './referral-create-shadow.service';

@Module({
  imports: [ActionEngineModule, CrmModule],
  controllers: [ReferralCreateShadowController],
  providers: [ReferralCreateShadowService],
})
export class ReferralsModule {}
