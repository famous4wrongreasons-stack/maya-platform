import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { ReferralRewardFulfillShadowDto } from './dto/referral-reward-fulfill-shadow.dto';
import { ReferralRewardFulfillShadowService } from './referral-reward-fulfill-shadow.service';

@ApiTags('referrals')
@Controller('referrals/internal/shadow')
export class ReferralRewardFulfillShadowController {
  constructor(private readonly shadow: ReferralRewardFulfillShadowService) {}

  @Public()
  @Post('fulfill-referral-reward')
  @ApiOperation({
    summary: 'Plan one referral reward fulfillment without value mutation',
  })
  planFulfillment(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: ReferralRewardFulfillShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planFulfillment(dto);
  }
}
