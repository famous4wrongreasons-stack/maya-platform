import { Module } from '@nestjs/common';

import { ActionEngineModule } from '../action-engine';
import { CrmModule } from '../crm/crm.module';
import { ReferralCreateShadowController } from './referral-create-shadow.controller';
import { ReferralCreateShadowService } from './referral-create-shadow.service';
import { ReferralResolveShadowController } from './referral-resolve-shadow.controller';
import { ReferralResolveShadowService } from './referral-resolve-shadow.service';
import { ReferralRewardIssueShadowController } from './referral-reward-issue-shadow.controller';
import { ReferralRewardIssueShadowService } from './referral-reward-issue-shadow.service';

@Module({
  imports: [ActionEngineModule, CrmModule],
  controllers: [
    ReferralCreateShadowController,
    ReferralResolveShadowController,
    ReferralRewardIssueShadowController,
  ],
  providers: [
    ReferralCreateShadowService,
    ReferralResolveShadowService,
    ReferralRewardIssueShadowService,
  ],
})
export class ReferralsModule {}
