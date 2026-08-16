import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { InternalCalendarModule } from '../internal-calendar/internal-calendar.module';
import { UsersModule } from '../users/users.module';
import { ClientIdentityService } from './client-identity.service';
import { CrmAdapterFactory } from './crm-adapter.factory';
import { CrmController } from './crm.controller';
import { CrmIntegrationController } from './crm-integration.controller';
import { CrmService } from './crm.service';

@Module({
  imports: [AuditLogModule, InternalCalendarModule, UsersModule],
  controllers: [CrmController, CrmIntegrationController],
  providers: [ClientIdentityService, CrmAdapterFactory, CrmService],
  exports: [ClientIdentityService, CrmService],
})
export class CrmModule {}
