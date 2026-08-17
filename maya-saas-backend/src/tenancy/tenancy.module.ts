import { Global, Module } from '@nestjs/common';

import { BridgeSourceService } from './bridge-source.service';
import { MembershipsService } from './memberships.service';
import { TenantContextService } from './tenant-context.service';
import { TenantResolutionMiddleware } from './tenant-resolution.middleware';
import { TenantResolverService } from './tenant-resolver.service';

@Global()
@Module({
  providers: [
    BridgeSourceService,
    MembershipsService,
    TenantContextService,
    TenantResolverService,
    TenantResolutionMiddleware,
  ],
  exports: [
    BridgeSourceService,
    MembershipsService,
    TenantContextService,
    TenantResolverService,
    TenantResolutionMiddleware,
  ],
})
export class TenancyModule {}
