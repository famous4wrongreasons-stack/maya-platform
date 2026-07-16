import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { TenantsService } from './tenants.service';

@ApiTags('mobile')
@Controller('mobile/config')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Public()
  @Get(':tenantSlug')
  @ApiOperation({
    summary: 'Get public white-label configuration by tenant slug',
  })
  getPublicConfig(@Param('tenantSlug') tenantSlug: string) {
    return this.tenantsService.getPublicMobileConfig(tenantSlug);
  }
}
