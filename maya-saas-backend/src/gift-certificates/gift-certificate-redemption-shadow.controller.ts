import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { GiftCertificateRedemptionShadowDto } from './dto/gift-certificate-redemption-shadow.dto';
import { GiftCertificateRedemptionShadowService } from './gift-certificate-redemption-shadow.service';

@ApiTags('gift-certificates')
@Controller('gift-certificates/internal/shadow')
export class GiftCertificateRedemptionShadowController {
  constructor(
    private readonly shadow: GiftCertificateRedemptionShadowService,
  ) {}

  @Public()
  @Post('redeem')
  @ApiOperation({
    summary:
      'Plan one exact full gift certificate redemption without value mutation',
  })
  planRedemption(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: GiftCertificateRedemptionShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planRedemption(dto);
  }
}
