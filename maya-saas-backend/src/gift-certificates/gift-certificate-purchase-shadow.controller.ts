import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { GiftCertificatePurchaseShadowDto } from './dto/gift-certificate-purchase-shadow.dto';
import { GiftCertificatePurchaseShadowService } from './gift-certificate-purchase-shadow.service';

@ApiTags('gift-certificates')
@Controller('gift-certificates/internal/shadow')
export class GiftCertificatePurchaseShadowController {
  constructor(private readonly shadow: GiftCertificatePurchaseShadowService) {}

  @Public()
  @Post('initiate-purchase')
  @ApiOperation({
    summary:
      'Plan one gift certificate checkout without provider or value mutation',
  })
  planPurchase(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: GiftCertificatePurchaseShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planPurchase(dto);
  }
}
