import { Module } from '@nestjs/common';

import { Package5Wave1Module } from '../package5-wave1/package5-wave1.module';
import { DashboardPreferencesController } from './dashboard-preferences.controller';
import { DashboardPreferencesService } from './dashboard-preferences.service';

@Module({
  imports: [Package5Wave1Module],
  controllers: [DashboardPreferencesController],
  providers: [DashboardPreferencesService],
  exports: [DashboardPreferencesService],
})
export class DashboardPreferencesModule {}
