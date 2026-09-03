import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { BrandingService } from './branding.service';

type BrandingRecord = {
  id: string;
  tenantId: string;
  logoUrl: string | null;
  appName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  backgroundImageUrl: string | null;
  fontFamily: string | null;
  buttonRadius: number | null;
  themeJson: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

type BrandingUpsertArgs = {
  where: {
    tenantId: string;
  };
  create: {
    tenantId: string;
    logoUrl?: string | null;
  };
  update: {
    logoUrl?: string | null;
  };
};

describe('BrandingService logo upload', () => {
  let uploadRoot: string;

  const baseBranding = (logoUrl: string | null): BrandingRecord => ({
    id: 'branding-1',
    tenantId: 'tenant-1',
    logoUrl,
    appName: null,
    primaryColor: null,
    secondaryColor: null,
    backgroundImageUrl: null,
    fontFamily: null,
    buttonRadius: null,
    themeJson: null,
    createdAt: new Date('2026-07-06T10:00:00.000Z'),
    updatedAt: new Date('2026-07-06T10:00:00.000Z'),
  });

  const createService = (prisma: PrismaService) => {
    const configService = {
      get: jest.fn((key: string) =>
        key === 'UPLOAD_ROOT' ? uploadRoot : undefined,
      ),
    } as unknown as ConfigService;

    const tenantContext = new TenantContextService();

    return {
      service: new BrandingService(prisma, configService, tenantContext),
      tenantContext,
    };
  };

  const createUpsertMock = () => {
    const resolveUpsert = (args: BrandingUpsertArgs): Promise<BrandingRecord> =>
      Promise.resolve(baseBranding(args.update.logoUrl ?? null));

    return jest.fn(resolveUpsert);
  };

  beforeEach(async () => {
    uploadRoot = await mkdtemp(join(tmpdir(), 'maya-logo-upload-'));
  });

  afterEach(async () => {
    await rm(uploadRoot, { recursive: true, force: true });
  });

  it('accepts a bounded canonical tenant logo payload without persisting it', () => {
    const upsertMock = createUpsertMock();
    const prisma = {
      brandingSettings: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: upsertMock,
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);
    const fileBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    expect(() =>
      service.assertValidTenantLogoFile({
        buffer: fileBuffer,
        mimetype: 'image/png',
        originalname: 'logo.png',
        size: fileBuffer.length,
      }),
    ).not.toThrow();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported logo file types', async () => {
    const upsertMock: jest.MockedFunction<
      (args: BrandingUpsertArgs) => Promise<BrandingRecord>
    > = jest.fn();
    const prisma = {
      brandingSettings: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: upsertMock,
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    await expect(
      Promise.resolve().then(() =>
        service.assertValidTenantLogoFile({
          buffer: Buffer.from('<svg></svg>'),
          mimetype: 'image/svg+xml',
          originalname: 'logo.svg',
          size: 11,
        }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('reads uploaded tenant logos with the correct content type', async () => {
    const upsertMock = createUpsertMock();
    const prisma = {
      brandingSettings: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: upsertMock,
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);
    const fileBuffer = Buffer.from([0xff, 0xd8, 0xff]);
    const filename = 'tenant-1-abcdef123.jpg';
    await mkdir(join(uploadRoot, 'tenant-logos'), { recursive: true });
    await writeFile(join(uploadRoot, 'tenant-logos', filename), fileBuffer);

    const result = await service.readTenantLogo(filename);

    expect(result.contentType).toBe('image/jpeg');
    expect(result.buffer).toEqual(fileBuffer);
  });

  it('reads canonical content-addressed provider photos', async () => {
    const prisma = {
      internalProvider: {},
    } as unknown as PrismaService;
    const { service } = createService(prisma);
    const fileBuffer = Buffer.from([0xff, 0xd8, 0xff]);
    const filename = `p5w4-${'a'.repeat(64)}.jpg`;
    await mkdir(join(uploadRoot, 'provider-avatars'), { recursive: true });
    await writeFile(join(uploadRoot, 'provider-avatars', filename), fileBuffer);

    const avatar = await service.readProviderAvatar(filename);
    expect(avatar).toEqual({
      buffer: fileBuffer,
      contentType: 'image/jpeg',
    });
  });

  it('rejects a foreign tenant before reading or writing branding', async () => {
    const findUniqueMock = jest.fn();
    const upsertMock = jest.fn();
    const prisma = {
      brandingSettings: {
        findUnique: findUniqueMock,
        upsert: upsertMock,
      },
    } as unknown as PrismaService;
    const { service, tenantContext } = createService(prisma);

    await expect(
      tenantContext.runAsSystemTenant('tenant-a', () =>
        service.upsertBranding('tenant-b', { appName: 'Blocked' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('fails closed before branding writes without tenant context', async () => {
    const upsertMock = jest.fn();
    const prisma = {
      brandingSettings: {
        upsert: upsertMock,
      },
    } as unknown as PrismaService;
    const { service } = createService(prisma);

    await expect(
      service.upsertBranding('tenant-1', { appName: 'Blocked' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
