import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Post,
  Query,
} from '@nestjs/common';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { ClientConsentReadService } from './client-consent-read.service';

const sessionProof = (authorization: string | undefined) => {
  if (!authorization?.startsWith('Bearer ') || !authorization.slice(7))
    throw new BadRequestException('Maya session required');
  return JSON.stringify({
    type: 'maya_jwt',
    credential: authorization.slice(7),
  });
};
@Controller('privacy/consents')
@TenantScoped()
export class ClientConsentReadController {
  constructor(private readonly owner: ClientConsentReadService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  read(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: Record<string, unknown>,
  ) {
    if (Object.keys(query).length)
      throw new BadRequestException(
        'Own consent read accepts no subject or filters',
      );
    return this.owner.readOwn(sessionProof(authorization));
  }

  @Post('export/qualification')
  @Header('Cache-Control', 'no-store')
  qualify(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.owner.qualifyExport(sessionProof(authorization), body);
  }
}
