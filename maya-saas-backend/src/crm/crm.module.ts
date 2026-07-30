import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { InternalCalendarModule } from '../internal-calendar/internal-calendar.module';
import { CrmAdapterFactory } from './crm-adapter.factory';
import { CrmController } from './crm.controller';
import { CrmIntegrationController } from './crm-integration.controller';
import { CrmService } from './crm.service';

@Module({
  imports: [AuditLogModule, InternalCalendarModule],
  controllers: [CrmController, CrmIntegrationController],
  providers: [CrmAdapterFactory, CrmService],
  exports: [CrmService],
})
export class CrmModule {}
