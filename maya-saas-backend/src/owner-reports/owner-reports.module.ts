import { Module } from '@nestjs/common';

import { OperationsAnalyticsModule } from '../analytics/operations-analytics.module';
import { DashboardPreferencesModule } from '../dashboard-preferences/dashboard-preferences.module';
import { InboxModule } from '../inbox/inbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OwnerReportsSchedulerService } from './owner-reports.scheduler';
import { OwnerReportsService } from './owner-reports.service';

@Module({
  imports: [
    PrismaModule,
    TenancyModule,
    OperationsAnalyticsModule,
    DashboardPreferencesModule,
    InboxModule,
  ],
  providers: [OwnerReportsService, OwnerReportsSchedulerService],
  exports: [OwnerReportsService],
})
export class OwnerReportsModule {}
