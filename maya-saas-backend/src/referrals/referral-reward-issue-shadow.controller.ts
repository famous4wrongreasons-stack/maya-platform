import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { ReferralRewardIssueShadowDto } from './dto/referral-reward-issue-shadow.dto';
import { ReferralRewardIssueShadowService } from './referral-reward-issue-shadow.service';

@ApiTags('referrals')
@Controller('referrals/internal/shadow')
export class ReferralRewardIssueShadowController {
  constructor(private readonly shadow: ReferralRewardIssueShadowService) {}

  @Public()
  @Post('issue-referral-rewards')
  @ApiOperation({
    summary: 'Plan one referral reward issuance without value mutation',
  })
  planIssuance(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: ReferralRewardIssueShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planIssuance(dto);
  }
}
