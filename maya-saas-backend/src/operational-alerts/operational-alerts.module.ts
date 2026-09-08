import { OperationalAlertsController } from './operational-alerts.controller';
import { OperationalAlertsScheduler } from './operational-alerts.scheduler';
import { CanonicalAppointmentAlertsService } from './canonical-appointment-alerts.service';
import { InboxModule } from '../inbox/inbox.module';
import { Module } from '@nestjs/common';
import { ActionEngineModule } from '../action-engine';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { CrmModule } from '../crm/crm.module';
import { InternalCalendarModule } from '../internal-calendar/internal-calendar.module';
import { CommunicationDeliveryModule } from '../communication-delivery';
import { OwnerReportFoundationModule } from '../owner-reports/owner-report-foundation.module';
import { OperationalAlertStore } from './operational-alert.store';
import { OperationalAlertSourceService } from './operational-alert-source.service';
import { OperationalAlertsService } from './operational-alerts.service';
@Module({
  imports: [
    InboxModule,
    PrismaModule,
    TenancyModule,
    ActionEngineModule,
    CrmModule,
    InternalCalendarModule,
    OwnerReportFoundationModule,
    CommunicationDeliveryModule,
  ],
  controllers: [OperationalAlertsController],
  providers: [
    OperationalAlertStore,
    OperationalAlertSourceService,
    OperationalAlertsService,
    OperationalAlertsScheduler,
    CanonicalAppointmentAlertsService,
  ],
  exports: [OperationalAlertsService],
})
export class OperationalAlertsModule {}
