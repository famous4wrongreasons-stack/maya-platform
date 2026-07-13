import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { BrandingModule } from '../branding/branding.module';
import { CrmModule } from '../crm/crm.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminController } from './admin.controller';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    TenantsModule,
    BrandingModule,
    CrmModule,
    UsersModule,
    SubscriptionsModule,
    AuditLogModule,
    OnboardingModule,
  ],
  controllers: [
    AdminController,
    AdminCatalogController,
    AdminAnalyticsController,
  ],
  providers: [AdminService],
})
export class AdminModule {}
