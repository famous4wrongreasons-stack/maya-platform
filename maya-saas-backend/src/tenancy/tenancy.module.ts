import { Global, Module } from '@nestjs/common';

import { MembershipsService } from './memberships.service';
import { TenantContextService } from './tenant-context.service';
import { TenantResolutionMiddleware } from './tenant-resolution.middleware';
import { TenantResolverService } from './tenant-resolver.service';

@Global()
@Module({
  providers: [
    MembershipsService,
    TenantContextService,
    TenantResolverService,
    TenantResolutionMiddleware,
  ],
  exports: [
    MembershipsService,
    TenantContextService,
    TenantResolverService,
    TenantResolutionMiddleware,
  ],
})
export class TenancyModule {}
