import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module';
import { DashboardPreferencesController } from './dashboard-preferences.controller';
import { DashboardPreferencesService } from './dashboard-preferences.service';

@Module({
  imports: [AuditLogModule],
  controllers: [DashboardPreferencesController],
  providers: [DashboardPreferencesService],
  exports: [DashboardPreferencesService],
})
export class DashboardPreferencesModule {}
