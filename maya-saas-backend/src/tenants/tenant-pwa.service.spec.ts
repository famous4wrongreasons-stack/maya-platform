import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';

import { BrandingService } from '../branding/branding.service';
import { TenantPwaService } from './tenant-pwa.service';
import { TenantsService } from './tenants.service';

describe('TenantPwaService', () => {
  const mobileConfig = (logoUrl: string | null = null) =>
    ({
      slug: 'demo-business',
      active: true,
      brand: { name: 'Мастер Артём' },
      branding: {
        app_name: 'Мастер Артём',
        logo_url: logoUrl,
        icon_url: null,
      },
      tenant: { default_locale: 'ru-RU' },
    }) as unknown as Awaited<
      ReturnType<TenantsService['getPublicMobileConfig']>
    >;

  const createService = (
    config: Record<string, string> = {},
    tenantLogoUrl: string | null = null,
  ) => {
    const configService = {
      get: jest.fn((name: string) => config[name]),
    } as unknown as ConfigService;
    const tenantsService = {
      getPublicMobileConfig: jest
        .fn()
        .mockResolvedValue(mobileConfig(tenantLogoUrl)),
    } as unknown as TenantsService;
    const brandingService = {
      readTenantLogo: jest.fn(),
    } as unknown as BrandingService;

    return {
      service: new TenantPwaService(
        configService,
        tenantsService,
        brandingService,
      ),
      brandingService,
    };
  };

  it('builds an isolated install identity and static MAYA icon fallback', async () => {
    const { service } = createService({
      PWA_TENANT_INSTALL_ENABLED: 'true',
      PWA_PUBLIC_APP_URL: 'https://app.example.test/app.html',
      PWA_PUBLIC_API_URL: 'https://app.example.test/api',
    });

    const manifest = await service.getManifest('DEMO-BUSINESS');
    const startUrl = new URL(manifest.start_url);

    expect(manifest).toMatchObject({
      id: '/tenant/demo-business',
      name: 'Мастер Артём',
      display: 'standalone',
      background_color: '#ffffff',
    });
    expect(startUrl.searchParams.get('booking_tenant')).toBe('demo-business');
    expect(startUrl.searchParams.get('booking_api_base')).toBe(
      'https://app.example.test/api',
    );
    expect(manifest.icons.map((icon) => icon.src)).toContain('/icon-512.png');
  });

  it('publishes normalized custom icon URLs only for safe local uploads', async () => {
    const logoUrl =
      '/api/public/uploads/tenant-logos/tenant-1-123e4567-e89b-12d3-a456-426614174000.png';
    const { service } = createService(
      { PWA_TENANT_INSTALL_ENABLED: 'true' },
      logoUrl,
    );

    const metadata = await service.getInstallMetadata('demo-business');
    const manifest = await service.getManifest('demo-business');

    expect(metadata).toMatchObject({
      has_custom_icon: true,
      native_app_icon_policy: 'maya_brand_only',
    });
    expect(manifest.icons).toContainEqual(
      expect.objectContaining({
        src: '/api/mobile/pwa/demo-business/icon/512.png?purpose=maskable',
        purpose: 'maskable',
      }),
    );
  });

  it('renders a square white PNG with a maskable safe area', async () => {
    const logoUrl =
      '/api/public/uploads/tenant-logos/tenant-1-123e4567-e89b-12d3-a456-426614174000.png';
    const { service, brandingService } = createService(
      { PWA_TENANT_INSTALL_ENABLED: 'true' },
      logoUrl,
    );
    const source = await sharp({
      create: {
        width: 40,
        height: 20,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    jest
      .spyOn(brandingService, 'readTenantLogo')
      .mockResolvedValue({ buffer: source, contentType: 'image/png' });

    const result = await service.renderIcon('demo-business', '192', true);
    const image = sharp(result);
    const metadata = await image.metadata();
    const corner = await image
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer();

    expect(metadata).toMatchObject({ width: 192, height: 192, format: 'png' });
    expect([...corner.slice(0, 3)]).toEqual([255, 255, 255]);
  });

  it('fails closed when tenant installation is disabled in production', async () => {
    const { service } = createService({ NODE_ENV: 'production' });

    await expect(service.getManifest('demo-business')).rejects.toMatchObject({
      response: {
        error: { code: 'tenant_pwa_install_disabled' },
      },
    });
  });
});
