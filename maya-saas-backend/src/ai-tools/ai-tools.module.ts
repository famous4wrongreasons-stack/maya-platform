import { Module } from '@nestjs/common';

import { OperationsAnalyticsModule } from '../analytics/operations-analytics.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { CrmModule } from '../crm/crm.module';
import { DashboardPreferencesModule } from '../dashboard-preferences/dashboard-preferences.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { MayaBrainRouterService } from '../ai-brain/maya-brain-router.service';
import { AiCoreController } from './ai-core.controller';
import { AiCoreModelService } from './ai-core-model.service';
import { AiCoreService } from './ai-core.service';
import { AiSpeechService } from './ai-speech.service';
import { AiToolHandlerService } from './ai-tool-handler.service';
import { AiToolPolicyService } from './ai-tool-policy.service';
import { AiToolRegistryService } from './ai-tool-registry.service';
import { AiToolRuntimeService } from './ai-tool-runtime.service';
import { AiToolsController } from './ai-tools.controller';
import { StaffScheduleCommandService } from './staff-schedule-command.service';
import { ClientIntelligenceService } from './client-intelligence.service';

import { CustomersModule } from '../customers/customers.module';
import { StaffModule } from '../staff/staff.module';

@Module({
  imports: [
    CustomersModule,
    StaffModule,
    OperationsAnalyticsModule,
    AppointmentsModule,
    AuditLogModule,
    AuthModule,
    CrmModule,
    DashboardPreferencesModule,
    EntitlementsModule,
    ExpensesModule,
    LoyaltyModule,
  ],
  controllers: [AiCoreController, AiToolsController],
  providers: [
    MayaBrainRouterService,
    AiCoreModelService,
    AiCoreService,
    AiSpeechService,
    AiToolHandlerService,
    AiToolPolicyService,
    AiToolRegistryService,
    AiToolRuntimeService,
    ClientIntelligenceService,
    StaffScheduleCommandService,
  ],
  exports: [AiCoreService, AiToolRegistryService, AiToolRuntimeService],
})
export class AiToolsModule {}
