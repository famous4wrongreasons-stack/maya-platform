import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { CustomerSubscriptionRenewalActivationShadowService } from './customer-subscription-renewal-activation-shadow.service';
import { CustomerSubscriptionRenewalActivationShadowDto } from './dto/customer-subscription-renewal-activation-shadow.dto';

@ApiTags('customer-subscriptions')
@Controller('customer-subscriptions/internal/shadow')
export class CustomerSubscriptionRenewalActivationShadowController {
  constructor(
    private readonly shadow: CustomerSubscriptionRenewalActivationShadowService,
  ) {}

  @Public()
  @Post('activate-renewal')
  @ApiOperation({
    summary:
      'Plan one paid successor subscription term without subscription mutation',
  })
  planRenewalActivation(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: CustomerSubscriptionRenewalActivationShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planActivation(dto);
  }
}
