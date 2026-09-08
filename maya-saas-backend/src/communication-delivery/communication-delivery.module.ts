import { ExpenseReminderFoundationModule } from '../expense-intake/expense-reminder-foundation.module';
import { NativeFeedbackFoundationModule } from '../native-feedback/native-feedback-foundation.module';
import { TeamCommunicationsFoundationModule } from '../team-communications/team-communications-foundation.module';
import { OwnerReportFoundationModule } from '../owner-reports/owner-report-foundation.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { CommunicationBulkDeliveryService } from './communication-bulk-delivery.service';
import { CommunicationBulkPolicyService } from './communication-bulk-policy.service';
import { Module } from '@nestjs/common';

import { ActionEngineModule } from '../action-engine';
import { PrismaModule } from '../prisma/prisma.module';
import { CommunicationDeliveryService } from './communication-delivery.service';
import { ClientWebPushModule } from '../crm/client-web-push.module';
import { CommunicationWebPushService } from './communication-web-push.service';
import { CommunicationWebPushTransport } from './communication-web-push.transport';

@Module({
  imports: [
    NativeFeedbackFoundationModule,
    ExpenseReminderFoundationModule,
    TeamCommunicationsFoundationModule,
    OwnerReportFoundationModule,
    EntitlementsModule,
    PrismaModule,
    ActionEngineModule,
    ClientWebPushModule,
  ],
  providers: [
    CommunicationBulkDeliveryService,
    CommunicationBulkPolicyService,
    CommunicationDeliveryService,
    CommunicationWebPushService,
    CommunicationWebPushTransport,
  ],
  exports: [
    CommunicationDeliveryService,
    CommunicationWebPushService,
    CommunicationBulkDeliveryService,
    CommunicationBulkPolicyService,
  ],
})
export class CommunicationDeliveryModule {}
