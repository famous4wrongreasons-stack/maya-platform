import { Module } from '@nestjs/common';

import { BrandingModule } from '../branding/branding.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { IndustryPresetsController } from './industry-presets.controller';
import { TenantPwaController } from './tenant-pwa.controller';
import { TenantPwaService } from './tenant-pwa.service';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TenantAccessStateService } from './tenant-access-state.service';

@Module({
  imports: [SubscriptionsModule, EntitlementsModule, BrandingModule],
  providers: [TenantsService, TenantAccessStateService, TenantPwaService],
  exports: [TenantsService, TenantAccessStateService],
  controllers: [
    TenantsController,
    TenantPwaController,
    IndustryPresetsController,
  ],
})
export class TenantsModule {}
