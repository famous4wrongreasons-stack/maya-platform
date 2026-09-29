import { AuditLogModule } from '../audit-log/audit-log.module';
import { WidgetReleaseController } from './widget-release.controller';
import { WidgetReleasePolicy } from './widget-release-policy.service';
import { WidgetReleaseService } from './widget-release.service';
import { Module } from '@nestjs/common';

import { EntitlementsService } from './entitlements.service';
import { FeatureGuard } from './feature.guard';
import { FeatureRegistryService } from './feature-registry.service';
import { FeaturesController } from './features.controller';

@Module({
  imports: [AuditLogModule],
  controllers: [FeaturesController, WidgetReleaseController],
  providers: [
    EntitlementsService,
    FeatureRegistryService,
    FeatureGuard,
    WidgetReleasePolicy,
    WidgetReleaseService,
  ],
  exports: [EntitlementsService, FeatureRegistryService, FeatureGuard],
})
export class EntitlementsModule {}
