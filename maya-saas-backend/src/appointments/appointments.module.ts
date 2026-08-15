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
  controllers: [AppointmentsController, AvailabilityController],
  providers: [AppointmentsService, TenantAppointmentRepository],
  exports: [AppointmentsService, TenantAppointmentRepository],
})
export class AppointmentsModule {}
