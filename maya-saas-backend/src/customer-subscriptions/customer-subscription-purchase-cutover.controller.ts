import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { CustomerSubscriptionPurchaseCutoverService } from './customer-subscription-purchase-cutover.service';
import { CustomerSubscriptionPurchaseCutoverDto } from './dto/customer-subscription-purchase-cutover.dto';

@ApiTags('customer-subscriptions')
@Controller('customer-subscriptions/internal/cutover')
export class CustomerSubscriptionPurchaseCutoverController {
  constructor(
    private readonly cutover: CustomerSubscriptionPurchaseCutoverService,
  ) {}

  @Public()
  @Post('initiate-purchase')
  @ApiOperation({
    summary:
      'Resolve a verified Client and execute the canonical P4-05 checkout',
  })
  initiatePurchase(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: CustomerSubscriptionPurchaseCutoverDto,
  ) {
    this.cutover.assertSecret(bridgeToken);
    return this.cutover.initiatePurchase(dto);
  }
}
