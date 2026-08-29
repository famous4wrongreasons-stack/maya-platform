import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { LegacyLoyaltyRedeemShadowDto } from './dto/legacy-loyalty-redeem-shadow.dto';
import { LegacyLoyaltyRedemptionShadowService } from './legacy-loyalty-redemption-shadow.service';

@ApiTags('loyalty')
@Controller('loyalty/internal/shadow')
export class LegacyLoyaltyRedemptionShadowController {
  constructor(private readonly shadow: LegacyLoyaltyRedemptionShadowService) {}

  @Public()
  @Post('legacy-redeem')
  @ApiOperation({
    summary:
      'Plan one legacy booking redemption without value or provider mutation',
  })
  planRedemption(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: LegacyLoyaltyRedeemShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planRedemption(dto);
  }
}
