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
import { AppointmentsService } from './appointments.service';
import { TenantAppointmentRepository } from './tenant-appointment.repository';

@Module({
  imports: [
    CrmModule,
    InternalCalendarModule,
    TenantsModule,
    UsersModule,
    AuditLogModule,
    InboxModule,
    RecoveryModule,
  ],
  controllers: [
    AppointmentsController,
    AvailabilityController,
    PersonalClientController,
  ],
  providers: [
    AppointmentsService,
    TenantAppointmentRepository,
    PersonalClientContextService,
  ],
  exports: [AppointmentsService, TenantAppointmentRepository],
})
export class AppointmentsModule {}
