import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { CommerceIntegrationController } from './commerce-integration.controller';
import { CommerceIntegrationService } from './commerce-integration.service';

@Module({
  imports: [AuditLogModule],
  controllers: [CommerceIntegrationController],
  providers: [CommerceIntegrationService],
  exports: [CommerceIntegrationService],
})
export class CommerceModule {}
