import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { CustomerSubscriptionUsageShadowService } from './customer-subscription-usage-shadow.service';
import { CustomerSubscriptionUsageShadowDto } from './dto/customer-subscription-usage-shadow.dto';

@ApiTags('customer-subscriptions')
@Controller('customer-subscriptions/internal/shadow')
export class CustomerSubscriptionUsageShadowController {
  constructor(
    private readonly shadow: CustomerSubscriptionUsageShadowService,
  ) {}

  @Public()
  @Post('sync-usage')
  @ApiOperation({
    summary:
      'Plan one exact immutable subscription usage claim without mutation',
  })
  planUsage(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: CustomerSubscriptionUsageShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planUsage(dto);
  }
}
