import { Module } from '@nestjs/common';

import { BusinessFactsModule } from '../business-facts/business-facts.module';
import { CrmModule } from '../crm/crm.module';
import { TenantsModule } from '../tenants/tenants.module';
import { OperationsAnalyticsController } from './operations-analytics.controller';
import { OperationsAnalyticsService } from './operations-analytics.service';

@Module({
  imports: [TenantsModule, CrmModule, BusinessFactsModule],
  controllers: [OperationsAnalyticsController],
  providers: [OperationsAnalyticsService],
  exports: [OperationsAnalyticsService],
})
export class OperationsAnalyticsModule {}
