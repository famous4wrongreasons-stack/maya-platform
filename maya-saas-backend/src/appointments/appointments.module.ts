import { EntitlementsModule } from '../entitlements/entitlements.module';
import { ActionEngineModule } from '../action-engine';
import { AuthRateLimitRepository } from '../auth/auth-rate-limit.repository';
import { PublicBookingController } from './public-booking.controller';
import { PublicBookingService } from './public-booking.service';
import { PublicBookingRepository } from './public-booking.repository';
import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { CrmModule } from '../crm/crm.module';
import { InboxModule } from '../inbox/inbox.module';
import { InternalCalendarModule } from '../internal-calendar/internal-calendar.module';
import { RecoveryModule } from '../recovery/recovery.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { AvailabilityController } from './availability.controller';
import { AppointmentsController } from './appointments.controller';
import { PersonalClientController } from './personal-client.controller';
import { PersonalClientContextService } from './personal-client-context.service';
import { PersonalClientReadService } from './personal-client-read.service';
import { AppointmentsService } from './appointments.service';
import { TenantAppointmentRepository } from './tenant-appointment.repository';

@Module({
  imports: [
    ActionEngineModule,
    EntitlementsModule,
    CrmModule,
    InternalCalendarModule,
    TenantsModule,
    UsersModule,
    AuditLogModule,
    InboxModule,
    RecoveryModule,
  ],
  controllers: [
    PublicBookingController,
    AppointmentsController,
    AvailabilityController,
    PersonalClientController,
  ],
  providers: [
    PublicBookingService,
    PublicBookingRepository,
    AuthRateLimitRepository,
    AppointmentsService,
    TenantAppointmentRepository,
    PersonalClientContextService,
    PersonalClientReadService,
  ],
  exports: [
    AppointmentsService,
    TenantAppointmentRepository,
    PersonalClientContextService,
  ],
})
export class AppointmentsModule {}
