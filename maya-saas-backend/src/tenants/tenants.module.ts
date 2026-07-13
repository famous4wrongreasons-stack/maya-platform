import { Module } from '@nestjs/common';

import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { IndustryPresetsController } from './industry-presets.controller';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TenantAccessStateService } from './tenant-access-state.service';

@Module({
  imports: [SubscriptionsModule, EntitlementsModule],
  providers: [TenantsService, TenantAccessStateService],
  exports: [TenantsService, TenantAccessStateService],
  controllers: [TenantsController, IndustryPresetsController],
})
export class TenantsModule {}
