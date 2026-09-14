import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { LegacyLoyaltyImportShadowDto } from './dto/legacy-loyalty-import-shadow.dto';
import { LegacyLoyaltyImportShadowService } from './legacy-loyalty-import-shadow.service';

@ApiTags('loyalty')
@Controller('loyalty/internal/shadow')
export class LegacyLoyaltyImportShadowController {
  constructor(private readonly shadow: LegacyLoyaltyImportShadowService) {}

  @Public()
  @Post('legacy-import')
  @ApiOperation({
    summary:
      'Plan one provider-card loyalty import without value or provider mutation',
  })
  planImport(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: LegacyLoyaltyImportShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planImport(dto);
  }
}
