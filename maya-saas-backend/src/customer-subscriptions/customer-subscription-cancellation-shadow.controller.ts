import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { CustomerSubscriptionCancellationShadowService } from './customer-subscription-cancellation-shadow.service';
import { CustomerSubscriptionCancellationShadowDto } from './dto/customer-subscription-cancellation-shadow.dto';

@ApiTags('customer-subscriptions')
@Controller('customer-subscriptions/internal/shadow')
export class CustomerSubscriptionCancellationShadowController {
  constructor(
    private readonly shadow: CustomerSubscriptionCancellationShadowService,
  ) {}

  @Public()
  @Post('cancel')
  @ApiOperation({
    summary: 'Plan one authorized cancellation without subscription mutation',
  })
  planCancellation(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: CustomerSubscriptionCancellationShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planCancellation(dto);
  }
}
