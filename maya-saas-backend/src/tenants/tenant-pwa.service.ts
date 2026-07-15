import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';

import { BrandingService } from '../branding/branding.service';
import { TenantsService } from './tenants.service';

const LOCAL_LOGO_PREFIX = '/api/public/uploads/tenant-logos/';
const SUPPORTED_ICON_SIZES = new Set([180, 192, 512]);

type TenantMobileConfig = Awaited<
  ReturnType<TenantsService['getPublicMobileConfig']>
>;

export interface TenantPwaManifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: 'standalone';
  orientation: 'portrait';
  background_color: string;
  theme_color: string;
  lang: string;
  categories: string[];
  icons: Array<{
    src: string;
    sizes: string;
    type: 'image/png';
    purpose: 'any' | 'maskable';
  }>;
}

@Injectable()
export class TenantPwaService {
  constructor(
    private readonly configService: ConfigService,
    private readonly tenantsService: TenantsService,
    private readonly brandingService: BrandingService,
  ) {}

  async getInstallMetadata(tenantSlug: string) {
    this.assertEnabled();
    const config = await this.tenantsService.getPublicMobileConfig(tenantSlug);
    const slug = config.slug;
    const manifestPath = `/api/mobile/pwa/${encodeURIComponent(slug)}/manifest.webmanifest`;
    const customIcon = this.getLocalLogoFilename(config) !== null;

    return {
      tenant_slug: slug,
      app_name: this.resolveAppName(config),
      enabled: true,
      installable: config.active,
      manifest_url: manifestPath,
      apple_touch_icon_url: customIcon
        ? `/api/mobile/pwa/${encodeURIComponent(slug)}/icon/180.png`
        : '/apple-touch-icon.png',
      start_url: this.buildStartUrl(slug),
      has_custom_icon: customIcon,
      native_app_icon_policy: 'maya_brand_only',
    };
  }

  async getManifest(tenantSlug: string): Promise<TenantPwaManifest> {
    this.assertEnabled();
    const config = await this.tenantsService.getPublicMobileConfig(tenantSlug);
    const slug = config.slug;
    const appName = this.resolveAppName(config);
    const customIcon = this.getLocalLogoFilename(config) !== null;
    const iconBase = `/api/mobile/pwa/${encodeURIComponent(slug)}/icon`;
    const icons = customIcon
      ? [
          {
            src: `${iconBase}/192.png`,
            sizes: '192x192',
            type: 'image/png' as const,
            purpose: 'any' as const,
          },
          {
            src: `${iconBase}/512.png`,
            sizes: '512x512',
            type: 'image/png' as const,
            purpose: 'any' as const,
          },
          {
            src: `${iconBase}/192.png?purpose=maskable`,
            sizes: '192x192',
            type: 'image/png' as const,
            purpose: 'maskable' as const,
          },
          {
            src: `${iconBase}/512.png?purpose=maskable`,
            sizes: '512x512',
            type: 'image/png' as const,
            purpose: 'maskable' as const,
          },
        ]
      : [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png' as const,
            purpose: 'any' as const,
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png' as const,
            purpose: 'any' as const,
          },
          {
            src: '/icon-192-maskable.png',
            sizes: '192x192',
            type: 'image/png' as const,
            purpose: 'maskable' as const,
          },
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png' as const,
            purpose: 'maskable' as const,
          },
        ];

    return {
      id: `/tenant/${encodeURIComponent(slug)}`,
      name: appName,
      short_name: this.shortenName(appName),
      description: `${appName}: запись, кабинет и связь с бизнесом`,
      start_url: this.buildStartUrl(slug),
      scope: this.resolveAppScope(),
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#ffffff',
      theme_color: '#ffffff',
      lang: config.tenant.default_locale?.split('-')[0] || 'ru',
      categories: ['business', 'lifestyle'],
      icons,
    };
  }

  async renderIcon(
    tenantSlug: string,
    rawSize: string,
    maskable: boolean,
  ): Promise<Buffer> {
    this.assertEnabled();
    const size = Number(rawSize);
    if (!Number.isInteger(size) || !SUPPORTED_ICON_SIZES.has(size)) {
      throw new NotFoundException('PWA icon size is not supported');
    }

    const config = await this.tenantsService.getPublicMobileConfig(tenantSlug);
    const filename = this.getLocalLogoFilename(config);
    if (!filename) {
      throw new NotFoundException('Tenant does not have a custom PWA icon');
    }

    const logo = await this.brandingService.readTenantLogo(filename);
    const safeAreaRatio = maskable ? 0.64 : 0.82;
    const contentSize = Math.max(1, Math.round(size * safeAreaRatio));
    const leading = Math.floor((size - contentSize) / 2);
    const trailing = size - contentSize - leading;

    return sharp(logo.buffer, { animated: false })
      .rotate()
      .resize({
        width: contentSize,
        height: contentSize,
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .extend({
        top: leading,
        right: trailing,
        bottom: trailing,
        left: leading,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png({ compressionLevel: 9, palette: false })
      .toBuffer();
  }

  private resolveAppName(config: TenantMobileConfig): string {
    return String(config.branding.app_name || config.brand.name || 'MAYA')
      .trim()
      .slice(0, 80);
  }

  private shortenName(name: string): string {
    const symbols = Array.from(name.trim());
    return symbols.length <= 12 ? name.trim() : symbols.slice(0, 12).join('');
  }

  private buildStartUrl(tenantSlug: string): string {
    const appUrl = new URL(
      this.configService.get<string>('PWA_PUBLIC_APP_URL')?.trim() ||
        'http://127.0.0.1:8787/app.html',
    );
    const apiUrl =
      this.configService.get<string>('PWA_PUBLIC_API_URL')?.trim() ||
      'http://127.0.0.1:3000/api';

    appUrl.searchParams.set('booking_backend', 'saas-local');
    appUrl.searchParams.set('booking_api_base', apiUrl.replace(/\/+$/, ''));
    appUrl.searchParams.set('booking_tenant', tenantSlug);
    return appUrl.toString();
  }

  private resolveAppScope(): string {
    const appUrl = new URL(
      this.configService.get<string>('PWA_PUBLIC_APP_URL')?.trim() ||
        'http://127.0.0.1:8787/app.html',
    );
    const lastSlash = appUrl.pathname.lastIndexOf('/');
    return appUrl.pathname.slice(0, lastSlash + 1) || '/';
  }

  private getLocalLogoFilename(config: TenantMobileConfig): string | null {
    const candidate = config.branding.icon_url || config.branding.logo_url;
    if (
      typeof candidate !== 'string' ||
      !candidate.startsWith(LOCAL_LOGO_PREFIX)
    ) {
      return null;
    }

    const filename = candidate.slice(LOCAL_LOGO_PREFIX.length);
    return /^[a-zA-Z0-9_-]+-[a-f0-9-]+\.(png|jpg|webp|gif)$/.test(filename)
      ? filename
      : null;
  }

  private assertEnabled(): void {
    const configured = this.configService
      .get<string>('PWA_TENANT_INSTALL_ENABLED')
      ?.trim()
      .toLowerCase();
    const enabled = configured
      ? configured === 'true'
      : this.configService.get<string>('NODE_ENV') !== 'production';

    if (!enabled) {
      throw new ServiceUnavailableException({
        message: 'Tenant PWA installation is not enabled.',
        error: {
          code: 'tenant_pwa_install_disabled',
          message: 'Tenant PWA installation is not enabled.',
        },
      });
    }
  }
}
