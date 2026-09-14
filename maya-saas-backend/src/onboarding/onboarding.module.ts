import { ActionEngineModule } from '../action-engine';
import { AiConfirmationCoordinatorService } from './ai-confirmation-coordinator.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { Package5Wave2Module } from '../package5-wave2/package5-wave2.module';
import { AiConfirmationReceiptService } from './ai-confirmation-receipt.service';
import { CanonicalTrialOnboardingService } from './canonical-trial-onboarding.service';
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
    ActionEngineModule,
    Package5Wave2Module,
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
    AiConfirmationCoordinatorService,
    CanonicalTrialOnboardingService,
    {
      provide: AiConfirmationReceiptService,
      useFactory: (prisma: PrismaService, encryption: EncryptionService) =>
        new AiConfirmationReceiptService(prisma, encryption),
      inject: [PrismaService, EncryptionService],
    },
    OnboardingService,
    AiOnboardingService,
    SafeOnboardingInterpreter,
    ConversationalOnboardingInterpreter,
    TrialActivationService,
  ],
  exports: [TrialActivationService, CanonicalTrialOnboardingService],
})
export class OnboardingModule {}
