import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { EntitlementsService } from './entitlements.service';
import { FeatureRegistryService } from './feature-registry.service';

@ApiTags('features')
@Controller('features')
export class FeaturesController {
  constructor(
    private readonly registry: FeatureRegistryService,
    private readonly entitlements: EntitlementsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Public()
  @Get('registry')
  @ApiOperation({ summary: 'List the platform feature registry' })
  listRegistry() {
    return { features: this.registry.list() };
  }

  @Get('effective')
  @ApiBearerAuth()
  @TenantScoped()
  @ApiOperation({ summary: 'List effective features for the active tenant' })
  getEffectiveFeatures() {
    return this.entitlements.getEffectiveEntitlements(
      this.tenantContext.requireTenantId(),
    );
  }
}
