import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { BrandingModule } from '../branding/branding.module';
import { CrmModule } from '../crm/crm.module';
import { TenantsModule } from '../tenants/tenants.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [TenantsModule, BrandingModule, CrmModule, AuditLogModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
