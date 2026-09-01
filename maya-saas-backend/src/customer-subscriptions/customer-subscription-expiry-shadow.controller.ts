import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { CustomerSubscriptionExpiryShadowService } from './customer-subscription-expiry-shadow.service';
import { CustomerSubscriptionExpiryShadowDto } from './dto/customer-subscription-expiry-shadow.dto';

@ApiTags('customer-subscriptions')
@Controller('customer-subscriptions/internal/shadow')
export class CustomerSubscriptionExpiryShadowController {
  constructor(
    private readonly shadow: CustomerSubscriptionExpiryShadowService,
  ) {}

  @Public()
  @Post('expire')
  @ApiOperation({
    summary: 'Plan one immutable-term expiry without subscription mutation',
  })
  planExpiry(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: CustomerSubscriptionExpiryShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planExpiry(dto);
  }
}
