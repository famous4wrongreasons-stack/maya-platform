import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import {
  listConnectableCrmProviders,
  listCrmProviderCapabilities,
} from './crm-provider-catalog';

@ApiTags('crm')
@Controller('crm')
export class CrmController {
  @Public()
  @Get('providers')
  @ApiOperation({
    summary: 'List implemented and planned CRM provider capabilities',
  })
  listProviders() {
    return {
      schema_version: 1,
      selectable_provider_keys: listConnectableCrmProviders(),
      providers: listCrmProviderCapabilities(),
    };
  }
}
