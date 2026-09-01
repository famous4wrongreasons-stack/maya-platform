import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { CustomerSubscriptionPurchaseShadowService } from './customer-subscription-purchase-shadow.service';
import { CustomerSubscriptionPurchaseShadowDto } from './dto/customer-subscription-purchase-shadow.dto';

@ApiTags('customer-subscriptions')
@Controller('customer-subscriptions/internal/shadow')
export class CustomerSubscriptionPurchaseShadowController {
  constructor(
    private readonly shadow: CustomerSubscriptionPurchaseShadowService,
  ) {}

  @Public()
  @Post('initiate-purchase')
  @ApiOperation({
    summary:
      'Plan one customer subscription checkout without provider or value mutation',
  })
  planPurchase(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: CustomerSubscriptionPurchaseShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planPurchase(dto);
  }
}
