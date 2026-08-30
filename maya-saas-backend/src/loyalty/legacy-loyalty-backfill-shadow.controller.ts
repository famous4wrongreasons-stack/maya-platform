import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { LegacyLoyaltyBackfillShadowDto } from './dto/legacy-loyalty-backfill-shadow.dto';
import { LegacyLoyaltyBackfillShadowService } from './legacy-loyalty-backfill-shadow.service';

@ApiTags('loyalty')
@Controller('loyalty/internal/shadow')
export class LegacyLoyaltyBackfillShadowController {
  constructor(private readonly shadow: LegacyLoyaltyBackfillShadowService) {}

  @Public()
  @Post('legacy-backfill')
  @ApiOperation({
    summary: 'Plan one provider-evidenced welcome grant without value mutation',
  })
  planBackfill(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: LegacyLoyaltyBackfillShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planBackfill(dto);
  }
}
