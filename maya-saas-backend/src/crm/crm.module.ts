import { Module } from '@nestjs/common';

import { ActionEngineModule } from '../action-engine';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { InternalCalendarModule } from '../internal-calendar/internal-calendar.module';
import { UsersModule } from '../users/users.module';
import { ClientIdentityService } from './client-identity.service';
import { CrmAdapterFactory } from './crm-adapter.factory';
import { CrmController } from './crm.controller';
import { CrmIntegrationController } from './crm-integration.controller';
import { CrmService } from './crm.service';
import { EventsModule } from '../events/events.module';
import { AppointmentChangeService } from './appointment-change.service';
import { AppointmentMirrorService } from './appointment-mirror.service';
import { AppointmentObservationService } from './appointment-observation.service';
import { AppointmentReconciliationScheduler } from './appointment-reconciliation.scheduler';
import { AppointmentReconciliationService } from './appointment-reconciliation.service';
import { OpportunityLifecycleRunner } from './opportunity-lifecycle.runner';
import { OpportunityLifecycleRepository } from '../opportunities/opportunity.lifecycle';
import { PrismaService } from '../prisma/prisma.service';
import { QuarantineCatchupService } from './quarantine-catchup.service';
import { ShadowIngestionController } from './shadow-ingestion.controller';
import { ShadowIngestionService } from './shadow-ingestion.service';

@Module({
  imports: [
    ActionEngineModule,
    AuditLogModule,
    EventsModule,
    InternalCalendarModule,
    UsersModule,
  ],
  controllers: [
    CrmController,
    CrmIntegrationController,
    ShadowIngestionController,
  ],
  providers: [
    AppointmentChangeService,
    AppointmentMirrorService,
    AppointmentObservationService,
    AppointmentReconciliationScheduler,
    AppointmentReconciliationService,
    OpportunityLifecycleRunner,
    {
      provide: OpportunityLifecycleRepository,
      useFactory: (prisma: PrismaService) =>
        new OpportunityLifecycleRepository(prisma),
      inject: [PrismaService],
    },
    ClientIdentityService,
    CrmAdapterFactory,
    CrmService,
    QuarantineCatchupService,
    ShadowIngestionService,
  ],
  exports: [
    AppointmentMirrorService,
    AppointmentReconciliationService,
    ClientIdentityService,
    CrmService,
    OpportunityLifecycleRepository,
    OpportunityLifecycleRunner,
    QuarantineCatchupService,
  ],
})
export class CrmModule {}
