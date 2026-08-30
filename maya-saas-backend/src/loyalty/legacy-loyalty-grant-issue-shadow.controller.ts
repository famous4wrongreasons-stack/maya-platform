import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { LegacyLoyaltyGrantIssueShadowDto } from './dto/legacy-loyalty-grant-issue-shadow.dto';
import { LegacyLoyaltyGrantIssueShadowService } from './legacy-loyalty-grant-issue-shadow.service';

@ApiTags('loyalty')
@Controller('loyalty/internal/shadow')
export class LegacyLoyaltyGrantIssueShadowController {
  constructor(private readonly shadow: LegacyLoyaltyGrantIssueShadowService) {}

  @Public()
  @Post('legacy-grant-issue')
  @ApiOperation({
    summary:
      'Plan one loyalty redemption grant without grant, code, or value mutation',
  })
  planIssue(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: LegacyLoyaltyGrantIssueShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planIssue(dto);
  }
}
