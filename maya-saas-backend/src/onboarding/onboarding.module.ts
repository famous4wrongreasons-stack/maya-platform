import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { BrandingModule } from '../branding/branding.module';
import { CrmModule } from '../crm/crm.module';
import { InternalCalendarModule } from '../internal-calendar/internal-calendar.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { OnboardingController } from './onboarding.controller';
import { AiOnboardingService } from './ai-onboarding.service';
import { ConversationalOnboardingInterpreter } from './conversational-onboarding-interpreter';
import { OnboardingService } from './onboarding.service';
import { SafeOnboardingInterpreter } from './safe-onboarding-interpreter';
import { TrialActivationService } from './trial-activation.service';

@Module({
  imports: [
    TenantsModule,
    BrandingModule,
    CrmModule,
    InternalCalendarModule,
    SubscriptionsModule,
    UsersModule,
    AuthModule,
    AuditLogModule,
  ],
  controllers: [OnboardingController],
  providers: [
    OnboardingService,
    AiOnboardingService,
    SafeOnboardingInterpreter,
    ConversationalOnboardingInterpreter,
    TrialActivationService,
  ],
  exports: [TrialActivationService],
})
export class OnboardingModule {}
