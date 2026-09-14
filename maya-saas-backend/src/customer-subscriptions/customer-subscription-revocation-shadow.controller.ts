import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { CustomerSubscriptionRevocationShadowService } from './customer-subscription-revocation-shadow.service';
import { CustomerSubscriptionRevocationShadowDto } from './dto/customer-subscription-revocation-shadow.dto';

@ApiTags('customer-subscriptions')
@Controller('customer-subscriptions/internal/shadow')
export class CustomerSubscriptionRevocationShadowController {
  constructor(
    private readonly shadow: CustomerSubscriptionRevocationShadowService,
  ) {}

  @Public()
  @Post('revoke')
  @ApiOperation({
    summary: 'Plan one owner-approved revocation without subscription mutation',
  })
  planRevocation(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: CustomerSubscriptionRevocationShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planRevocation(dto);
  }
}
