import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { BusinessContentController } from './business-content.controller';
import { BusinessContentService } from './business-content.service';

@Module({
  imports: [AuditLogModule],
  controllers: [BusinessContentController],
  providers: [BusinessContentService],
  exports: [BusinessContentService],
})
export class BusinessContentModule {}
