import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { ReferralCreateShadowDto } from './dto/referral-create-shadow.dto';
import { ReferralCreateShadowService } from './referral-create-shadow.service';

@ApiTags('referrals')
@Controller('referrals/internal/shadow')
export class ReferralCreateShadowController {
  constructor(private readonly shadow: ReferralCreateShadowService) {}

  @Public()
  @Post('create-customer-referral')
  @ApiOperation({
    summary: 'Plan one customer referral without referral or value mutation',
  })
  planCreate(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: ReferralCreateShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planCreate(dto);
  }
}
