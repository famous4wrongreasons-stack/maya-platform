import { Module } from '@nestjs/common';

import { OperationsAnalyticsModule } from '../analytics/operations-analytics.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { CrmModule } from '../crm/crm.module';
import { CustomersModule } from '../customers/customers.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { AiToolHandlerService } from './ai-tool-handler.service';
import { AiToolPolicyService } from './ai-tool-policy.service';
import { AiToolRegistryService } from './ai-tool-registry.service';
import { AiToolRuntimeService } from './ai-tool-runtime.service';
import { AiToolsController } from './ai-tools.controller';

@Module({
  imports: [
    OperationsAnalyticsModule,
    AppointmentsModule,
    AuditLogModule,
    CrmModule,
    CustomersModule,
    EntitlementsModule,
    ExpensesModule,
    LoyaltyModule,
  ],
  controllers: [AiToolsController],
  providers: [
    AiToolHandlerService,
    AiToolPolicyService,
    AiToolRegistryService,
    AiToolRuntimeService,
  ],
  exports: [AiToolRegistryService, AiToolRuntimeService],
})
export class AiToolsModule {}
