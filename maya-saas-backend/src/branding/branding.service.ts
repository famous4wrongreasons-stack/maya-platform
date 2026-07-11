import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

import { asJson } from '../common/json.util';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UpdateBrandingDto } from './dto/update-branding.dto';

const TENANT_LOGO_ROUTE_PREFIX = '/api/public/uploads/tenant-logos';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_MIME_EXTENSIONS = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

export interface UploadedLogoFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@Injectable()
export class BrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async upsertBranding(tenantId: string, dto: UpdateBrandingDto) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);

    return this.prisma.brandingSettings.upsert({
      where: { tenantId: scopedTenantId },
      create: {
        tenantId: scopedTenantId,
        logoUrl: dto.logoUrl,
        iconUrl: dto.iconUrl,
        faviconUrl: dto.faviconUrl,
        appName: dto.appName,
        primaryColor: dto.primaryColor,
        secondaryColor: dto.secondaryColor,
        accentColor: dto.accentColor,
        backgroundColor: dto.backgroundColor,
        surfaceColor: dto.surfaceColor,
        textPrimaryColor: dto.textPrimaryColor,
        textSecondaryColor: dto.textSecondaryColor,
        backgroundImageUrl: dto.backgroundImageUrl,
        fontFamily: dto.fontFamily,
        headingFontFamily: dto.headingFontFamily,
        buttonRadius: dto.buttonRadius,
        buttonStyle: dto.buttonStyle,
        themeMode: dto.themeMode,
        borderRadiusJson: dto.borderRadiusJson
          ? asJson(dto.borderRadiusJson)
          : undefined,
        contactDetailsJson: dto.contactDetailsJson
          ? asJson(dto.contactDetailsJson)
          : undefined,
        socialLinksJson: dto.socialLinksJson
          ? asJson(dto.socialLinksJson)
          : undefined,
        mapLinksJson: dto.mapLinksJson ? asJson(dto.mapLinksJson) : undefined,
        legalLinksJson: dto.legalLinksJson
          ? asJson(dto.legalLinksJson)
          : undefined,
        splashScreenJson: dto.splashScreenJson
          ? asJson(dto.splashScreenJson)
          : undefined,
        onboardingJson: dto.onboardingJson
          ? asJson(dto.onboardingJson)
          : undefined,
        storeListingJson: dto.storeListingJson
          ? asJson(dto.storeListingJson)
          : undefined,
        emailBrandingJson: dto.emailBrandingJson
          ? asJson(dto.emailBrandingJson)
          : undefined,
        telegramBrandingJson: dto.telegramBrandingJson
          ? asJson(dto.telegramBrandingJson)
          : undefined,
        themeJson: dto.themeJson ? asJson(dto.themeJson) : undefined,
      },
      update: {
        logoUrl: dto.logoUrl,
        iconUrl: dto.iconUrl,
        faviconUrl: dto.faviconUrl,
        appName: dto.appName,
        primaryColor: dto.primaryColor,
        secondaryColor: dto.secondaryColor,
        accentColor: dto.accentColor,
        backgroundColor: dto.backgroundColor,
        surfaceColor: dto.surfaceColor,
        textPrimaryColor: dto.textPrimaryColor,
        textSecondaryColor: dto.textSecondaryColor,
        backgroundImageUrl: dto.backgroundImageUrl,
        fontFamily: dto.fontFamily,
        headingFontFamily: dto.headingFontFamily,
        buttonRadius: dto.buttonRadius,
        buttonStyle: dto.buttonStyle,
        themeMode: dto.themeMode,
        borderRadiusJson: dto.borderRadiusJson
          ? asJson(dto.borderRadiusJson)
          : undefined,
        contactDetailsJson: dto.contactDetailsJson
          ? asJson(dto.contactDetailsJson)
          : undefined,
        socialLinksJson: dto.socialLinksJson
          ? asJson(dto.socialLinksJson)
          : undefined,
        mapLinksJson: dto.mapLinksJson ? asJson(dto.mapLinksJson) : undefined,
        legalLinksJson: dto.legalLinksJson
          ? asJson(dto.legalLinksJson)
          : undefined,
        splashScreenJson: dto.splashScreenJson
          ? asJson(dto.splashScreenJson)
          : undefined,
        onboardingJson: dto.onboardingJson
          ? asJson(dto.onboardingJson)
          : undefined,
        storeListingJson: dto.storeListingJson
          ? asJson(dto.storeListingJson)
          : undefined,
        emailBrandingJson: dto.emailBrandingJson
          ? asJson(dto.emailBrandingJson)
          : undefined,
        telegramBrandingJson: dto.telegramBrandingJson
          ? asJson(dto.telegramBrandingJson)
          : undefined,
        themeJson: dto.themeJson ? asJson(dto.themeJson) : undefined,
      },
    });
  }

  async uploadTenantLogo(tenantId: string, file: UploadedLogoFile) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    this.validateLogoFile(file);

    const existingBranding = await this.prisma.brandingSettings.findUnique({
      where: { tenantId: scopedTenantId },
      select: {
        logoUrl: true,
      },
    });
    const extension = LOGO_MIME_EXTENSIONS.get(file.mimetype);

    if (!extension) {
      throw new BadRequestException(
        this.buildLogoUploadError(
          'logo_file_type_unsupported',
          'Logo must be a PNG, JPEG, WEBP, or GIF image.',
          'file',
        ),
      );
    }

    const filename = `${scopedTenantId}-${randomUUID()}.${extension}`;
    const uploadDir = this.getTenantLogoUploadDir();
    const absolutePath = join(uploadDir, filename);
    const logoUrl = `${TENANT_LOGO_ROUTE_PREFIX}/${filename}`;

    await mkdir(uploadDir, { recursive: true });
    await writeFile(absolutePath, file.buffer, { flag: 'wx' });

    const branding = await this.prisma.brandingSettings.upsert({
      where: { tenantId: scopedTenantId },
      create: {
        tenantId: scopedTenantId,
        logoUrl,
      },
      update: {
        logoUrl,
      },
    });

    await this.removePreviousLocalLogo(existingBranding?.logoUrl ?? null);

    return branding;
  }

  async readTenantLogo(filename: string) {
    if (!/^[a-zA-Z0-9_-]+-[a-f0-9-]+\.(png|jpg|webp|gif)$/.test(filename)) {
      throw new NotFoundException('Logo not found');
    }

    const absolutePath = resolve(this.getTenantLogoUploadDir(), filename);
    const uploadDir = resolve(this.getTenantLogoUploadDir());

    if (!absolutePath.startsWith(`${uploadDir}/`)) {
      throw new NotFoundException('Logo not found');
    }

    try {
      return {
        buffer: await readFile(absolutePath),
        contentType: this.resolveContentType(filename),
      };
    } catch {
      throw new NotFoundException('Logo not found');
    }
  }

  private validateLogoFile(file: UploadedLogoFile) {
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        this.buildLogoUploadError(
          'logo_file_required',
          'Upload a logo file.',
          'file',
        ),
      );
    }

    if (file.size > MAX_LOGO_BYTES || file.buffer.length > MAX_LOGO_BYTES) {
      throw new BadRequestException(
        this.buildLogoUploadError(
          'logo_file_too_large',
          'Logo file must be 2 MB or smaller.',
          'file',
        ),
      );
    }

    if (!LOGO_MIME_EXTENSIONS.has(file.mimetype)) {
      throw new BadRequestException(
        this.buildLogoUploadError(
          'logo_file_type_unsupported',
          'Logo must be a PNG, JPEG, WEBP, or GIF image.',
          'file',
        ),
      );
    }
  }

  private getTenantLogoUploadDir(): string {
    const root =
      this.configService.get<string>('UPLOAD_ROOT')?.trim() ||
      join(process.cwd(), 'uploads');

    return resolve(root, 'tenant-logos');
  }

  private async removePreviousLocalLogo(logoUrl: string | null) {
    if (!logoUrl?.startsWith(`${TENANT_LOGO_ROUTE_PREFIX}/`)) {
      return;
    }

    const filename = logoUrl.slice(TENANT_LOGO_ROUTE_PREFIX.length + 1);

    if (!/^[a-zA-Z0-9_-]+-[a-f0-9-]+\.(png|jpg|webp|gif)$/.test(filename)) {
      return;
    }

    await rm(join(this.getTenantLogoUploadDir(), filename), { force: true });
  }

  private resolveContentType(filename: string): string {
    if (filename.endsWith('.png')) {
      return 'image/png';
    }

    if (filename.endsWith('.jpg')) {
      return 'image/jpeg';
    }

    if (filename.endsWith('.webp')) {
      return 'image/webp';
    }

    return 'image/gif';
  }

  private buildLogoUploadError(
    code:
      | 'logo_file_required'
      | 'logo_file_too_large'
      | 'logo_file_type_unsupported',
    message: string,
    field?: string,
  ) {
    return {
      message,
      error: {
        code,
        message,
        ...(field ? { field } : {}),
      },
    };
  }
}
