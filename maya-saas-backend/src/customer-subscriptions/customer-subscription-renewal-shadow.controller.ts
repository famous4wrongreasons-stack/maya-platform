import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { CustomerSubscriptionRenewalShadowService } from './customer-subscription-renewal-shadow.service';
import { CustomerSubscriptionRenewalShadowDto } from './dto/customer-subscription-renewal-shadow.dto';

@ApiTags('customer-subscriptions')
@Controller('customer-subscriptions/internal/shadow')
export class CustomerSubscriptionRenewalShadowController {
  constructor(
    private readonly shadow: CustomerSubscriptionRenewalShadowService,
  ) {}

  @Public()
  @Post('initiate-renewal')
  @ApiOperation({
    summary:
      'Plan one successor-term checkout without provider or subscription mutation',
  })
  planRenewal(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: CustomerSubscriptionRenewalShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planRenewal(dto);
  }
}
