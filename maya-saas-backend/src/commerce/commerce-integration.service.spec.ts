import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CommerceIntegrationService } from './commerce-integration.service';

describe('CommerceIntegrationService', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function setup() {
    const checkedAt = new Date('2026-08-03T12:00:00.000Z');
    jest.useFakeTimers({ now: checkedAt });
    const stored = {
      id: 'commerce-a',
      tenantId: 'tenant-a',
      provider: 'yookassa',
      encryptedShopId: 'enc:shop-123456',
      encryptedSecretKey: 'enc:secret-value',
      status: 'active',
      verifiedAt: checkedAt,
      lastCheckedAt: checkedAt,
      lastErrorCode: null,
      lastErrorAt: null,
      createdAt: checkedAt,
      updatedAt: checkedAt,
    };
    const findUnique = jest.fn().mockResolvedValue(null);
    type CommerceUpsertArgs = {
      where: { tenantId: string };
      create: {
        tenantId: string;
        encryptedShopId: string;
        encryptedSecretKey: string;
      };
    };
    const upsert = jest.fn((args: CommerceUpsertArgs) => {
      void args;
      return Promise.resolve(stored);
    });
    const remove = jest.fn().mockResolvedValue(stored);
    const prisma = {
      commerceIntegration: {
        findUnique,
        upsert,
        update: jest.fn().mockResolvedValue(stored),
        delete: remove,
      },
    } as unknown as PrismaService;
    const encrypt = jest.fn((value: string) => `enc:${value}`);
    const decrypt = jest.fn((value: string) => value.replace(/^enc:/, ''));
    const encryption = { encrypt, decrypt } as unknown as EncryptionService;
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const tenantContext = new TenantContextService();
    const service = new CommerceIntegrationService(
      prisma,
      encryption,
      tenantContext,
      config,
    );
    return {
      checkedAt,
      stored,
      findUnique,
      upsert,
      remove,
      encrypt,
      decrypt,
      tenantContext,
      service,
    };
  }

  it('verifies and encrypts YooKassa credentials without returning secrets', async () => {
    const current = setup();
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    const result = await current.tenantContext.runAsSystemTenant(
      'tenant-a',
      () =>
        current.service.connect('tenant-a', {
          shopId: 'shop-123456',
          secretKey: 'secret-value',
        }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0];
    expect(requestUrl).toBe('https://api.yookassa.ru/v3/payments?limit=1');
    expect(requestInit?.method).toBe('GET');
    const requestHeaders = requestInit?.headers as Record<string, string>;
    expect(requestHeaders.Authorization).toMatch(/^Basic /);
    expect(current.encrypt).toHaveBeenCalledWith('shop-123456');
    expect(current.encrypt).toHaveBeenCalledWith('secret-value');
    expect(current.upsert).toHaveBeenCalledTimes(1);
    const upsertArgs = current.upsert.mock.calls[0]?.[0];
    expect(upsertArgs?.where).toEqual({ tenantId: 'tenant-a' });
    expect(upsertArgs?.create).toMatchObject({
      tenantId: 'tenant-a',
      encryptedShopId: 'enc:shop-123456',
      encryptedSecretKey: 'enc:secret-value',
    });
    expect(result.connection.shop_id_masked).toBe('sh*******56');
    expect(JSON.stringify(result)).not.toContain('secret-value');
    expect(JSON.stringify(result)).not.toContain('shop-123456');
  });

  it('fails closed before reading another tenant commerce integration', async () => {
    const current = setup();

    await expect(
      current.tenantContext.runAsSystemTenant('tenant-a', () =>
        current.service.getStatus('tenant-b'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(current.findUnique).not.toHaveBeenCalled();
  });

  it('deletes only the current tenant credentials', async () => {
    const current = setup();
    current.findUnique.mockResolvedValue({ id: 'commerce-a' });

    const result = await current.tenantContext.runAsSystemTenant(
      'tenant-a',
      () => current.service.disconnect('tenant-a'),
    );

    expect(current.findUnique).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      select: { id: true },
    });
    expect(current.remove).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
    });
    expect(result).toEqual({ ok: true, disconnected: true });
  });
});
