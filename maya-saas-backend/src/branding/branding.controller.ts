import {
  Controller,
  Get,
  Header,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { Public } from '../decorators/public.decorator';
import { BrandingService } from './branding.service';

@ApiTags('public')
@Controller('public/uploads')
export class BrandingController {
  constructor(private readonly brandingService: BrandingService) {}

  @Public()
  @Get('tenant-logos/:filename')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @ApiOperation({ summary: 'Read an uploaded tenant logo image' })
  async readTenantLogo(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const logo = await this.brandingService.readTenantLogo(filename);

    response.type(logo.contentType);

    return new StreamableFile(logo.buffer);
  }

  @Public()
  @Get('provider-avatars/:filename')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @ApiOperation({ summary: 'Read an uploaded provider profile image' })
  async readProviderAvatar(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const avatar = await this.brandingService.readProviderAvatar(filename);

    response.type(avatar.contentType);

    return new StreamableFile(avatar.buffer);
  }
}
