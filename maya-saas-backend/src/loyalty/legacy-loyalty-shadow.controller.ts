import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { LegacyLoyaltyEarnShadowDto } from './dto/legacy-loyalty-earn-shadow.dto';
import { LegacyLoyaltyShadowService } from './legacy-loyalty-shadow.service';

@ApiTags('loyalty')
@Controller('loyalty/internal/shadow')
export class LegacyLoyaltyShadowController {
  constructor(private readonly shadow: LegacyLoyaltyShadowService) {}

  @Public()
  @Post('legacy-earn')
  @ApiOperation({
    summary: 'Plan one legacy loyalty earn candidate without value mutation',
  })
  planEarn(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: LegacyLoyaltyEarnShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planEarn(dto);
  }
}
