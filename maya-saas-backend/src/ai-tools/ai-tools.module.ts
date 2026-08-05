import { Module } from '@nestjs/common';

import { OperationsAnalyticsModule } from '../analytics/operations-analytics.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AuthModule } from '../auth/auth.module';
import { CrmModule } from '../crm/crm.module';
import { CustomersModule } from '../customers/customers.module';
import { DashboardPreferencesModule } from '../dashboard-preferences/dashboard-preferences.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { StaffModule } from '../staff/staff.module';
import { MayaBrainController } from '../ai-brain/maya-brain.controller';
import { MayaBrainKnowledgeService } from '../ai-brain/maya-brain-knowledge.service';
import { MayaBrainMemoryService } from '../ai-brain/maya-brain-memory.service';
import { MayaBrainPromptRegistryService } from '../ai-brain/maya-brain-prompt-registry.service';
import { MayaBrainRouterService } from '../ai-brain/maya-brain-router.service';
import { MayaBrainService } from '../ai-brain/maya-brain.service';
import { AiCoreController } from './ai-core.controller';
import { AiCoreModelService } from './ai-core-model.service';
import { AiCoreService } from './ai-core.service';
import { AiToolHandlerService } from './ai-tool-handler.service';
import { AiToolPolicyService } from './ai-tool-policy.service';
import { AiToolRegistryService } from './ai-tool-registry.service';
import { AiToolRuntimeService } from './ai-tool-runtime.service';
import { AiToolsController } from './ai-tools.controller';
import { StaffScheduleCommandService } from './staff-schedule-command.service';

@Module({
  imports: [
    OperationsAnalyticsModule,
    AppointmentsModule,
    AuditLogModule,
    AuthModule,
    CrmModule,
    CustomersModule,
    DashboardPreferencesModule,
    EntitlementsModule,
    ExpensesModule,
    LoyaltyModule,
    StaffModule,
  ],
  controllers: [AiCoreController, AiToolsController, MayaBrainController],
  providers: [
    MayaBrainKnowledgeService,
    MayaBrainMemoryService,
    MayaBrainPromptRegistryService,
    MayaBrainRouterService,
    MayaBrainService,
    AiCoreModelService,
    AiCoreService,
    AiToolHandlerService,
    AiToolPolicyService,
    AiToolRegistryService,
    AiToolRuntimeService,
    StaffScheduleCommandService,
  ],
  exports: [
    AiCoreService,
    AiToolRegistryService,
    AiToolRuntimeService,
    MayaBrainService,
  ],
})
export class AiToolsModule {}
