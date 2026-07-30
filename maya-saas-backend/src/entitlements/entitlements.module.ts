import { Module } from '@nestjs/common';

import { EntitlementsService } from './entitlements.service';
import { FeatureGuard } from './feature.guard';
import { FeatureRegistryService } from './feature-registry.service';
import { FeaturesController } from './features.controller';

@Module({
  controllers: [FeaturesController],
  providers: [EntitlementsService, FeatureRegistryService, FeatureGuard],
  exports: [EntitlementsService, FeatureRegistryService, FeatureGuard],
})
export class EntitlementsModule {}
