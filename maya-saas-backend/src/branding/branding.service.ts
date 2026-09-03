import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';

import { asJson } from '../common/json.util';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UpdateBrandingDto } from './dto/update-branding.dto';

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

  assertValidTenantLogoFile(
    file: UploadedLogoFile | undefined,
  ): asserts file is UploadedLogoFile {
    this.validateLogoFile(file);
  }

  async getTenantBrandingOrThrow(tenantId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const branding = await this.prisma.brandingSettings.findUnique({
      where: { tenantId: scopedTenantId },
    });
    if (!branding) throw new NotFoundException('Tenant branding not found');
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

  async readProviderAvatar(filename: string) {
    if (!this.isValidProviderAvatarFilename(filename)) {
      throw new NotFoundException('Provider avatar not found');
    }

    const absolutePath = resolve(this.getProviderAvatarUploadDir(), filename);
    const uploadDir = resolve(this.getProviderAvatarUploadDir());

    if (!absolutePath.startsWith(`${uploadDir}/`)) {
      throw new NotFoundException('Provider avatar not found');
    }

    try {
      return {
        buffer: await readFile(absolutePath),
        contentType: this.resolveContentType(filename),
      };
    } catch {
      throw new NotFoundException('Provider avatar not found');
    }
  }

  private validateLogoFile(
    file: UploadedLogoFile | undefined,
  ): asserts file is UploadedLogoFile {
    this.validateImageFile(file, 'logo');
  }

  private validateImageFile(
    file: UploadedLogoFile | undefined,
    kind: 'logo' | 'avatar',
  ): asserts file is UploadedLogoFile {
    const noun = kind === 'logo' ? 'Logo' : 'Photo';
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        this.buildLogoUploadError(
          'logo_file_required',
          `Upload a ${kind} file.`,
          'file',
        ),
      );
    }

    if (file.size > MAX_LOGO_BYTES || file.buffer.length > MAX_LOGO_BYTES) {
      throw new BadRequestException(
        this.buildLogoUploadError(
          'logo_file_too_large',
          `${noun} file must be 2 MB or smaller.`,
          'file',
        ),
      );
    }

    if (!LOGO_MIME_EXTENSIONS.has(file.mimetype)) {
      throw new BadRequestException(
        this.buildLogoUploadError(
          'logo_file_type_unsupported',
          `${noun} must be a PNG, JPEG, WEBP, or GIF image.`,
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

  private getProviderAvatarUploadDir(): string {
    const root =
      this.configService.get<string>('UPLOAD_ROOT')?.trim() ||
      join(process.cwd(), 'uploads');

    return resolve(root, 'provider-avatars');
  }

  private isValidProviderAvatarFilename(filename: string): boolean {
    return /^(?:p5w4-[a-f0-9]{64}|[a-zA-Z0-9_-]+-[a-zA-Z0-9_-]+-[a-f0-9-]+)\.(png|jpg|webp|gif)$/.test(
      filename,
    );
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
