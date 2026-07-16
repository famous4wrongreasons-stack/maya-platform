import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { listCrmProviderCapabilities } from './crm-provider-catalog';

@ApiTags('crm')
@Controller('crm')
export class CrmController {
  @Public()
  @Get('providers')
  @ApiOperation({
    summary: 'List implemented and planned CRM provider capabilities',
  })
  listProviders() {
    const providers = listCrmProviderCapabilities();
    const production = process.env.NODE_ENV === 'production';

    return {
      schema_version: 1,
      selectable_provider_keys: providers
        .filter(
          (provider) =>
            provider.connectable &&
            (!production || provider.productionReady === true),
        )
        .map((provider) => provider.provider),
      providers,
    };
  }
}
