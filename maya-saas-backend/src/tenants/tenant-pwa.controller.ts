import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { Public } from '../decorators/public.decorator';
import { TenantPwaService } from './tenant-pwa.service';

@ApiTags('mobile')
@Controller('mobile/pwa')
export class TenantPwaController {
  constructor(private readonly tenantPwaService: TenantPwaService) {}

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Find a client-ready tenant by name or city' })
  searchBusinesses(
    @Query('q') query: string = '',
    @Query('city') city?: string,
  ) {
    return this.tenantPwaService.searchBusinesses(query, city);
  }

  @Public()
  @Get(':tenantSlug/install')
  @ApiOperation({ summary: 'Get tenant-specific PWA installation metadata' })
  getInstallMetadata(@Param('tenantSlug') tenantSlug: string) {
    return this.tenantPwaService.getInstallMetadata(tenantSlug);
  }

  @Public()
  @Get(':tenantSlug/manifest.webmanifest')
  @ApiOperation({ summary: 'Get tenant-specific web app manifest' })
  async getManifest(
    @Param('tenantSlug') tenantSlug: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.type('application/manifest+json; charset=utf-8');
    response.setHeader(
      'Cache-Control',
      'public, max-age=60, stale-while-revalidate=300',
    );
    return this.tenantPwaService.getManifest(tenantSlug);
  }

  @Public()
  @Get(':tenantSlug/icon/:size.png')
  @ApiOperation({ summary: 'Get a normalized tenant PWA icon' })
  async getIcon(
    @Param('tenantSlug') tenantSlug: string,
    @Param('size') size: string,
    @Query('purpose') purpose: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const icon = await this.tenantPwaService.renderIcon(
      tenantSlug,
      size,
      purpose === 'maskable',
    );
    response.type('image/png');
    response.setHeader(
      'Cache-Control',
      'public, max-age=300, stale-while-revalidate=3600',
    );
    return new StreamableFile(icon);
  }

  @Public()
  @Get(':tenantSlug/qr.svg')
  @ApiOperation({ summary: 'Get a QR code for the tenant smart link' })
  async getQr(
    @Param('tenantSlug') tenantSlug: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const svg = await this.tenantPwaService.renderQrSvg(tenantSlug);
    response.type('image/svg+xml; charset=utf-8');
    response.setHeader(
      'Cache-Control',
      'public, max-age=300, stale-while-revalidate=3600',
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return svg;
  }
}
