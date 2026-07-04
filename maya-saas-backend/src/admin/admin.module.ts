import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { BrandingModule } from '../branding/branding.module';
import { CrmModule } from '../crm/crm.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    TenantsModule,
    BrandingModule,
    CrmModule,
    UsersModule,
    SubscriptionsModule,
    AuditLogModule,
  ],
  controllers: [AdminController, AdminCatalogController],
  providers: [AdminService],
})
export class AdminModule {}
