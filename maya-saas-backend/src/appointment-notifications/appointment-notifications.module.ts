import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { CrmModule } from '../crm/crm.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { InboxModule } from '../inbox/inbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AppointmentNotificationsScheduler } from './appointment-notifications.scheduler';
import { AppointmentNotificationsService } from './appointment-notifications.service';

@Module({
  imports: [
    PrismaModule,
    CrmModule,
    InboxModule,
    EntitlementsModule,
    AuditLogModule,
  ],
  providers: [
    AppointmentNotificationsService,
    AppointmentNotificationsScheduler,
  ],
  exports: [AppointmentNotificationsService],
})
export class AppointmentNotificationsModule {}
