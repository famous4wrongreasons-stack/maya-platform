import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { LegacyLoyaltyGrantConsumeShadowDto } from './dto/legacy-loyalty-grant-consume-shadow.dto';
import { LegacyLoyaltyGrantConsumeShadowService } from './legacy-loyalty-grant-consume-shadow.service';

@ApiTags('loyalty')
@Controller('loyalty/internal/shadow')
export class LegacyLoyaltyGrantConsumeShadowController {
  constructor(
    private readonly shadow: LegacyLoyaltyGrantConsumeShadowService,
  ) {}

  @Public()
  @Post('legacy-grant-consume')
  @ApiOperation({
    summary:
      'Plan one loyalty grant consumption without redemption, value, or provider mutation',
  })
  planConsume(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: LegacyLoyaltyGrantConsumeShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planConsume(dto);
  }
}
