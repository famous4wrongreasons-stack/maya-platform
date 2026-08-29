import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { LegacyLoyaltyExpireShadowDto } from './dto/legacy-loyalty-expire-shadow.dto';
import { LegacyLoyaltyExpiryShadowService } from './legacy-loyalty-expiry-shadow.service';

@ApiTags('loyalty')
@Controller('loyalty/internal/shadow')
export class LegacyLoyaltyExpiryShadowController {
  constructor(private readonly shadow: LegacyLoyaltyExpiryShadowService) {}

  @Public()
  @Post('legacy-expire')
  @ApiOperation({
    summary: 'Plan one legacy loyalty expiry candidate without value mutation',
  })
  planExpiry(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: LegacyLoyaltyExpireShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planExpiry(dto);
  }
}
