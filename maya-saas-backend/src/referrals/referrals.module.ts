import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ActionEngineModule,
  ActionEngineRuntimeService,
} from '../action-engine';
import { CrmModule } from '../crm/crm.module';
import { PrismaService } from '../prisma/prisma.service';
import { P404ReferralRewardExecutableService } from './p4-04-referral-reward-executable.service';
import { ReferralCreateShadowController } from './referral-create-shadow.controller';
import { ReferralCreateShadowService } from './referral-create-shadow.service';
import { ReferralResolveShadowController } from './referral-resolve-shadow.controller';
import { ReferralResolveShadowService } from './referral-resolve-shadow.service';
import { ReferralRewardIssueShadowController } from './referral-reward-issue-shadow.controller';
import { ReferralRewardIssueShadowService } from './referral-reward-issue-shadow.service';
import { ReferralRewardPresentationService } from './referral-reward-presentation.service';
import { ReferralRewardFulfillShadowController } from './referral-reward-fulfill-shadow.controller';
import { ReferralRewardFulfillShadowService } from './referral-reward-fulfill-shadow.service';
import { ReferralRewardSchedulerEnvelopeService } from './referral-reward-scheduler-envelope.service';

@Module({
  imports: [ActionEngineModule, CrmModule],
  controllers: [
    ReferralCreateShadowController,
    ReferralResolveShadowController,
    ReferralRewardIssueShadowController,
    ReferralRewardFulfillShadowController,
  ],
  providers: [
    ReferralCreateShadowService,
    ReferralResolveShadowService,
    ReferralRewardIssueShadowService,
    ReferralRewardPresentationService,
    ReferralRewardFulfillShadowService,
    ReferralRewardSchedulerEnvelopeService,
    {
      provide: P404ReferralRewardExecutableService,
      useFactory: (
        prisma: PrismaService,
        actionEngine: ActionEngineRuntimeService,
        config: ConfigService,
      ) =>
        new P404ReferralRewardExecutableService(prisma, actionEngine, {
          presentationKey: requiredReferralRewardSetting(
            config,
            'MAYA_REFERRAL_REWARD_PRESENTATION_KEY',
          ),
          presentationKeyVersion: requiredReferralRewardVersion(config),
          claimLookupKey: requiredReferralRewardSetting(
            config,
            'MAYA_REFERRAL_REWARD_CLAIM_SECRET',
          ),
        }),
      inject: [PrismaService, ActionEngineRuntimeService, ConfigService],
    },
  ],
  exports: [P404ReferralRewardExecutableService],
})
export class ReferralsModule {}

function requiredReferralRewardSetting(
  config: ConfigService,
  name:
    | 'MAYA_REFERRAL_REWARD_PRESENTATION_KEY'
    | 'MAYA_REFERRAL_REWARD_CLAIM_SECRET',
): string {
  const value = config.get<string>(name)?.trim();
  if (!value || value.length < 32 || value.length > 256) {
    throw new Error(`${name} must contain from 32 to 256 characters`);
  }
  return value;
}

function requiredReferralRewardVersion(config: ConfigService): string {
  const value = config
    .get<string>('MAYA_REFERRAL_REWARD_PRESENTATION_KEY_VERSION')
    ?.trim();
  if (!value || !/^[A-Za-z0-9._:-]{1,64}$/.test(value)) {
    throw new Error('MAYA_REFERRAL_REWARD_PRESENTATION_KEY_VERSION is invalid');
  }
  return value;
}
