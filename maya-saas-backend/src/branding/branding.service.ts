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
  ) {}

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

  async uploadTenantLogo(tenantId: string, file: UploadedLogoFile) {
    this.validateLogoFile(file);

    const existingBranding = await this.prisma.brandingSettings.findUnique({
      where: { tenantId },
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

    const filename = `${tenantId}-${randomUUID()}.${extension}`;
    const uploadDir = this.getTenantLogoUploadDir();
    const absolutePath = join(uploadDir, filename);
    const logoUrl = `${TENANT_LOGO_ROUTE_PREFIX}/${filename}`;

    await mkdir(uploadDir, { recursive: true });
    await writeFile(absolutePath, file.buffer, { flag: 'wx' });

    const branding = await this.prisma.brandingSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
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
