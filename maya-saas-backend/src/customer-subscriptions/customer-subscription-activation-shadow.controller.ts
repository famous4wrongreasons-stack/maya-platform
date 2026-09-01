import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { CustomerSubscriptionActivationShadowService } from './customer-subscription-activation-shadow.service';
import { CustomerSubscriptionActivationShadowDto } from './dto/customer-subscription-activation-shadow.dto';

@ApiTags('customer-subscriptions')
@Controller('customer-subscriptions/internal/shadow')
export class CustomerSubscriptionActivationShadowController {
  constructor(
    private readonly shadow: CustomerSubscriptionActivationShadowService,
  ) {}

  @Public()
  @Post('activate')
  @ApiOperation({
    summary:
      'Plan one paid customer subscription term without subscription mutation',
  })
  planActivation(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: CustomerSubscriptionActivationShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planActivation(dto);
  }
}
