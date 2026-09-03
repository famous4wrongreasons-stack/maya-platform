import { Module } from '@nestjs/common';

import { CrmModule } from '../crm/crm.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { InboxModule } from '../inbox/inbox.module';
import { Package5Wave1Module } from '../package5-wave1/package5-wave1.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AppointmentNotificationsScheduler } from './appointment-notifications.scheduler';
import { AppointmentNotificationsService } from './appointment-notifications.service';

@Module({
  imports: [
    PrismaModule,
    CrmModule,
    InboxModule,
    EntitlementsModule,
    Package5Wave1Module,
  ],
  providers: [
    AppointmentNotificationsService,
    AppointmentNotificationsScheduler,
  ],
  exports: [AppointmentNotificationsService],
})
export class AppointmentNotificationsModule {}
