import { NativeFeedbackFoundationModule } from '../native-feedback/native-feedback-foundation.module';
import { NativeFeedbackService } from '../native-feedback/native-feedback.service';
import { NativeFeedbackController } from '../native-feedback/native-feedback.controller';
import { NativeFeedbackScheduler } from '../native-feedback/native-feedback.scheduler';
import { ClientProfileReadModule } from '../crm/client-profile-read.module';
import { ClientAppointmentCreateService } from '../appointments/client-appointment-create.service';
import { ClientLoyaltyReadService } from './client-loyalty-read.service';
import { ClientAppointmentReadService } from './client-appointment-read.service';
import { ClientAppointmentCancelService } from './client-appointment-cancel.service';
import { ClientAppointmentRescheduleService } from './client-appointment-reschedule.service';
import { ClientHabitsService } from './client-habits.service';
import { ClientWantedSlotService } from './client-wanted-slot.service';
import { LegacyClientWantedSlotController } from './client-wanted-slot.controller';
import {
  ClientHabitsController,
  LegacyClientHabitsController,
} from './client-habits.controller';
import { ClientPreferencesService } from './client-preferences.service';
import {
  ClientPreferencesController,
  LegacyClientPreferencesController,
} from './client-preferences.controller';
import { Module } from '@nestjs/common';
import { ClientChannelAuthenticatorService } from './client-channel-authenticator.service';
import { ClientChannelRuntimeService } from './client-channel-runtime.service';
import {
  ClientChannelController,
  LegacyClientChannelController,
} from './client-channel.controller';

import {
  ActionEngineKernel,
  ActionEngineModule,
  ActionEngineRuntimeService,
  CanonicalActionIngressService,
} from '../action-engine';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { CommunicationDeliveryModule } from '../communication-delivery';
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
import { LegacyAppointmentBridgeController } from './legacy-appointment-bridge.controller';
import { LegacyAppointmentBridgeService } from './legacy-appointment-bridge.service';
import { Package5Wave3CanonicalCutoverService } from '../package5-wave3/package5-wave3-canonical-cutover.service';
import { Package5Wave3ProductionGatewayService } from '../package5-wave3/package5-wave3-production-gateway.service';
import {
  Package5Wave3ExecutableService,
  Package5Wave3ShadowService,
} from '../package5-wave3/package5-wave3.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

@Module({
  imports: [
    NativeFeedbackFoundationModule,
    ClientProfileReadModule,
    ActionEngineModule,
    AuditLogModule,
    CommunicationDeliveryModule,
    EventsModule,
    InternalCalendarModule,
    UsersModule,
  ],
  controllers: [
    NativeFeedbackController,
    ClientHabitsController,
    LegacyClientHabitsController,
    LegacyClientWantedSlotController,
    ClientPreferencesController,
    LegacyClientPreferencesController,
    ClientChannelController,
    LegacyClientChannelController,
    CrmController,
    CrmIntegrationController,
    LegacyAppointmentBridgeController,
    ShadowIngestionController,
  ],
  providers: [
    NativeFeedbackService,
    NativeFeedbackScheduler,
    ClientAppointmentCreateService,
    ClientLoyaltyReadService,
    ClientAppointmentReadService,
    ClientAppointmentCancelService,
    ClientAppointmentRescheduleService,
    ClientHabitsService,
    ClientWantedSlotService,
    ClientPreferencesService,
    ClientChannelAuthenticatorService,
    ClientChannelRuntimeService,
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
    Package5Wave3ProductionGatewayService,
    {
      provide: Package5Wave3ShadowService,
      useFactory: (
        runtime: ActionEngineRuntimeService,
        prisma: PrismaService,
        tenantContext: TenantContextService,
        kernel: ActionEngineKernel,
        gateway: Package5Wave3ProductionGatewayService,
      ) =>
        new Package5Wave3ShadowService(
          runtime,
          prisma,
          tenantContext,
          kernel,
          gateway,
        ),
      inject: [
        ActionEngineRuntimeService,
        PrismaService,
        TenantContextService,
        ActionEngineKernel,
        Package5Wave3ProductionGatewayService,
      ],
    },
    {
      provide: Package5Wave3ExecutableService,
      useFactory: (
        prisma: PrismaService,
        ingress: CanonicalActionIngressService,
        kernel: ActionEngineKernel,
        runtime: ActionEngineRuntimeService,
        planner: Package5Wave3ShadowService,
        gateway: Package5Wave3ProductionGatewayService,
      ) =>
        new Package5Wave3ExecutableService(
          prisma,
          ingress,
          kernel,
          runtime,
          planner,
          gateway,
        ),
      inject: [
        PrismaService,
        CanonicalActionIngressService,
        ActionEngineKernel,
        ActionEngineRuntimeService,
        Package5Wave3ShadowService,
        Package5Wave3ProductionGatewayService,
      ],
    },
    Package5Wave3CanonicalCutoverService,
    LegacyAppointmentBridgeService,
    QuarantineCatchupService,
    ShadowIngestionService,
  ],
  exports: [
    ClientWantedSlotService,
    ClientAppointmentCreateService,
    ClientLoyaltyReadService,
    ClientAppointmentReadService,
    ClientAppointmentCancelService,
    ClientAppointmentRescheduleService,
    AppointmentMirrorService,
    AppointmentReconciliationService,
    ClientChannelRuntimeService,
    ClientIdentityService,
    CrmService,
    Package5Wave3CanonicalCutoverService,
    OpportunityLifecycleRepository,
    OpportunityLifecycleRunner,
    QuarantineCatchupService,
  ],
})
export class CrmModule {}
