import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { LegacyLoyaltyRefundShadowDto } from './dto/legacy-loyalty-refund-shadow.dto';
import { LegacyLoyaltyRefundShadowService } from './legacy-loyalty-refund-shadow.service';

@ApiTags('loyalty')
@Controller('loyalty/internal/shadow')
export class LegacyLoyaltyRefundShadowController {
  constructor(private readonly shadow: LegacyLoyaltyRefundShadowService) {}

  @Public()
  @Post('legacy-refund')
  @ApiOperation({
    summary:
      'Plan one cancellation refund without loyalty or provider mutation',
  })
  planRefund(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: LegacyLoyaltyRefundShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planRefund(dto);
  }
}
