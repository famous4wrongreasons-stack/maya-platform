import { Module } from '@nestjs/common';

import { TenantsModule } from '../tenants/tenants.module';
import { OperationsAnalyticsController } from './operations-analytics.controller';
import { OperationsAnalyticsService } from './operations-analytics.service';

@Module({
  imports: [TenantsModule],
  controllers: [OperationsAnalyticsController],
  providers: [OperationsAnalyticsService],
  exports: [OperationsAnalyticsService],
})
export class OperationsAnalyticsModule {}
