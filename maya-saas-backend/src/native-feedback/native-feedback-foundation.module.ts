import { Module } from '@nestjs/common';
import { ActionEngineModule } from '../action-engine';
import { PrismaModule } from '../prisma/prisma.module';
import { ClientWebPushModule } from '../crm/client-web-push.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { NativeFeedbackPolicyService } from './native-feedback-policy.service';
import { NativeFeedbackStore } from './native-feedback.store';
@Module({ imports: [PrismaModule, ActionEngineModule, ClientWebPushModule, EntitlementsModule], providers: [NativeFeedbackPolicyService, NativeFeedbackStore], exports: [NativeFeedbackPolicyService, NativeFeedbackStore] })
export class NativeFeedbackFoundationModule {}
