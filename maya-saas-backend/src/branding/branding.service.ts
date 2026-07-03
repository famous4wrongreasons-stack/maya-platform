import { Injectable } from '@nestjs/common';

import { asJson } from '../common/json.util';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBrandingDto } from './dto/update-branding.dto';

@Injectable()
export class BrandingService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertBranding(tenantId: string, dto: UpdateBrandingDto) {
    return this.prisma.brandingSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        logoUrl: dto.logoUrl,
        appName: dto.appName,
        primaryColor: dto.primaryColor,
        secondaryColor: dto.secondaryColor,
        backgroundImageUrl: dto.backgroundImageUrl,
        fontFamily: dto.fontFamily,
        buttonRadius: dto.buttonRadius,
        themeJson: dto.themeJson ? asJson(dto.themeJson) : undefined,
      },
      update: {
        logoUrl: dto.logoUrl,
        appName: dto.appName,
        primaryColor: dto.primaryColor,
        secondaryColor: dto.secondaryColor,
        backgroundImageUrl: dto.backgroundImageUrl,
        fontFamily: dto.fontFamily,
        buttonRadius: dto.buttonRadius,
        themeJson: dto.themeJson ? asJson(dto.themeJson) : undefined,
      },
    });
  }
}
