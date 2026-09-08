import { OwnerReportDownloadService } from './owner-report-download.service';
import { OwnerReportSnapshotsController } from './owner-report-snapshots.controller';
import { OwnerReportFoundationModule } from './owner-report-foundation.module';
import { CommunicationDeliveryModule } from '../communication-delivery/communication-delivery.module';
import { OwnerReportsController } from './owner-reports.controller';
import { Module } from '@nestjs/common';

import { BusinessStateModule } from '../business-state/business-state.module';
import { DashboardPreferencesModule } from '../dashboard-preferences/dashboard-preferences.module';
import { InboxModule } from '../inbox/inbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OwnerReportsSchedulerService } from './owner-reports.scheduler';
import { OwnerReportsService } from './owner-reports.service';

@Module({
  imports: [
    OwnerReportFoundationModule,
    CommunicationDeliveryModule,
    PrismaModule,
    TenancyModule,
    BusinessStateModule,
    DashboardPreferencesModule,
    InboxModule,
  ],
  controllers: [OwnerReportsController, OwnerReportSnapshotsController],
  providers: [
    OwnerReportsService,
    OwnerReportsSchedulerService,
    OwnerReportDownloadService,
  ],
  exports: [OwnerReportsService],
})
export class OwnerReportsModule {}
