import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { ReferralResolveShadowDto } from './dto/referral-resolve-shadow.dto';
import { ReferralResolveShadowService } from './referral-resolve-shadow.service';

@ApiTags('referrals')
@Controller('referrals/internal/shadow')
export class ReferralResolveShadowController {
  constructor(private readonly shadow: ReferralResolveShadowService) {}

  @Public()
  @Post('resolve-customer-referral')
  @ApiOperation({
    summary: 'Plan one referral resolution without business or value mutation',
  })
  planResolution(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: ReferralResolveShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planResolution(dto);
  }
}
