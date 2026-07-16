import { Module } from '@nestjs/common';

import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [SubscriptionsModule],
  providers: [TenantsService],
  exports: [TenantsService],
  controllers: [TenantsController],
})
export class TenantsModule {}
