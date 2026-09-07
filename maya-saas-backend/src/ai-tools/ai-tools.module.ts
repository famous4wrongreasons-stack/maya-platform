import { Module } from '@nestjs/common';
import { ActionEngineModule } from '../action-engine/action-engine.module';

import { BusinessStateModule } from '../business-state/business-state.module';

import { OperationsAnalyticsModule } from '../analytics/operations-analytics.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AppointmentNotificationsModule } from '../appointment-notifications/appointment-notifications.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { BusinessContentModule } from '../business-content/business-content.module';
import { CrmModule } from '../crm/crm.module';
import { DashboardPreferencesModule } from '../dashboard-preferences/dashboard-preferences.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { InboxModule } from '../inbox/inbox.module';
import { Package5Wave1Module } from '../package5-wave1/package5-wave1.module';
import { RecoveryModule } from '../recovery/recovery.module';
import { MayaBrainRouterService } from '../ai-brain/maya-brain-router.service';
import { AiCoreController } from './ai-core.controller';
import { AiCoreModelService } from './ai-core-model.service';
import { AiCoreService } from './ai-core.service';
import { AiMemoryService } from './ai-memory.service';
import { AiSpeechService } from './ai-speech.service';
import { BusinessFactsModule } from '../business-facts/business-facts.module';
import { AiToolHandlerService } from './ai-tool-handler.service';
import { AiToolPolicyService } from './ai-tool-policy.service';
import { AiToolRegistryService } from './ai-tool-registry.service';
import { AiToolRuntimeService } from './ai-tool-runtime.service';
import { AiToolReceiptService } from './ai-tool-receipt.service';
import { AiToolsController } from './ai-tools.controller';
import { StaffScheduleCommandService } from './staff-schedule-command.service';

import { CustomersModule } from '../customers/customers.module';
import { StaffModule } from '../staff/staff.module';
import { ConversationIntelligenceService } from '../conversation-intelligence/conversation-intelligence.service';

@Module({
  imports: [
    ActionEngineModule,
    BusinessStateModule,
    // 🔴 Cycle 04 P6. Единственный читатель записей за бизнес-период.
    BusinessFactsModule,
    CustomersModule,
    StaffModule,
    OperationsAnalyticsModule,
    AppointmentsModule,
    AppointmentNotificationsModule,
    AuditLogModule,
    AuthModule,
    BusinessContentModule,
    CrmModule,
    DashboardPreferencesModule,
    EntitlementsModule,
    ExpensesModule,
    LoyaltyModule,
    InboxModule,
    Package5Wave1Module,
    RecoveryModule,
  ],
  controllers: [AiCoreController, AiToolsController],
  providers: [
    MayaBrainRouterService,
    ConversationIntelligenceService,
    AiCoreModelService,
    AiCoreService,
    AiMemoryService,
    AiSpeechService,
    AiToolHandlerService,
    AiToolPolicyService,
    AiToolRegistryService,
    AiToolRuntimeService,
    AiToolReceiptService,
    StaffScheduleCommandService,
  ],
  exports: [AiCoreService, AiToolRegistryService, AiToolRuntimeService],
})
export class AiToolsModule {}
