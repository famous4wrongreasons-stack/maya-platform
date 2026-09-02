import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../decorators/public.decorator';
import { GiftCertificateActivationShadowDto } from './dto/gift-certificate-activation-shadow.dto';
import { GiftCertificateActivationShadowService } from './gift-certificate-activation-shadow.service';

@ApiTags('gift-certificates')
@Controller('gift-certificates/internal/shadow')
export class GiftCertificateActivationShadowController {
  constructor(
    private readonly shadow: GiftCertificateActivationShadowService,
  ) {}

  @Public()
  @Post('activate')
  @ApiOperation({
    summary:
      'Plan one paid gift certificate activation without certificate mutation',
  })
  planActivation(
    @Headers('x-maya-inbox-bridge') bridgeToken: string | undefined,
    @Body() dto: GiftCertificateActivationShadowDto,
  ) {
    this.shadow.assertSecret(bridgeToken);
    return this.shadow.planActivation(dto);
  }
}
