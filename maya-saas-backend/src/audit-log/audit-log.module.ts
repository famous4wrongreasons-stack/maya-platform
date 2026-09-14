import { Module } from '@nestjs/common';

import { AuditLogService } from './audit-log.service';
import { TenantAuditReadService } from './tenant-audit-read.service';
import { TenantAuditReadController } from './tenant-audit-read.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';

@Module({
  imports: [PrismaModule, TenancyModule],
  providers: [AuditLogService, TenantAuditReadService],
  controllers: [TenantAuditReadController],
  exports: [AuditLogService],
})
export class AuditLogModule {}
