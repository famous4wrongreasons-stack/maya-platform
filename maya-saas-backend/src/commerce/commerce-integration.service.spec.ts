import { BadGatewayException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EncryptionService } from '../encryption/encryption.service';
import type { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CommerceIntegrationService } from './commerce-integration.service';
import type { P410CommerceCredentialCanonicalCutoverService } from './p4-10-commerce-credential-canonical-cutover.service';

describe('CommerceIntegrationService canonical cutover facade', () => {
  function setup() {
    const checkedAt = new Date('2026-09-03T12:00:00.000Z');
    const encryption = new EncryptionService(
      new ConfigService({
        CRM_ENCRYPTION_KEY: 'p4-10-commerce-facade-test-key'.repeat(3),
      }),
    );
    const stored = {
      id: 'commerce-a',
      tenantId: 'tenant-a',
      provider: 'yookassa',
      encryptedShopId: encryption.encrypt('shop-123456'),
      encryptedSecretKey: encryption.encrypt('secret-value'),
      status: 'active',
      verifiedAt: checkedAt,
      lastCheckedAt: checkedAt,
      lastErrorCode: null,
      lastErrorAt: null,
      createdAt: checkedAt,
      updatedAt: checkedAt,
    };
    const findUnique = jest.fn().mockResolvedValue(stored);
    const prisma = {
      commerceIntegration: { findUnique },
    } as unknown as PrismaService;
    const setCredentials = jest.fn().mockResolvedValue({
      actionClass: 'connect_commerce_payment_credentials',
    });
    const recheck = jest.fn().mockResolvedValue({
      verificationErrorCode: null,
    });
    const disconnect = jest.fn().mockResolvedValue({
      actionClass: 'disconnect_commerce_payment_credentials',
    });
    const canonical = {
      setCredentials,
      recheck,
      disconnect,
    } as unknown as P410CommerceCredentialCanonicalCutoverService;
    const tenantContext = new TenantContextService();
    const service = new CommerceIntegrationService(
      prisma,
      encryption,
      tenantContext,
      canonical,
    );
    return {
      disconnect,
      findUnique,
      recheck,
      service,
      setCredentials,
      tenantContext,
    };
  }

  it('delegates credential connect/replace to the canonical Action Engine owner', async () => {
    const current = setup();
    const result = await current.tenantContext.runAsSystemTenant(
      'tenant-a',
      () =>
        current.service.connect(
          'tenant-a',
          'owner-a',
          { shopId: 'shop-123456', secretKey: 'secret-value' },
          'credential-request-1',
        ),
    );
    expect(current.setCredentials).toHaveBeenCalledWith(
      'tenant-a',
      'owner-a',
      { shopId: 'shop-123456', secretKey: 'secret-value' },
      'credential-request-1',
    );
    expect(result.connection.shop_id_masked).toBe('sh*******56');
    expect(JSON.stringify(result)).not.toContain('secret-value');
    expect(JSON.stringify(result)).not.toContain('shop-123456');
  });

  it('delegates recheck and maps a canonical unavailable observation', async () => {
    const current = setup();
    current.recheck.mockResolvedValue({
      verificationErrorCode: 'commerce_provider_unavailable',
    });
    await expect(
      current.tenantContext.runAsSystemTenant('tenant-a', () =>
        current.service.recheck('tenant-a', 'owner-a', 'credential-recheck-1'),
      ),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(current.recheck).toHaveBeenCalledWith(
      'tenant-a',
      'owner-a',
      'credential-recheck-1',
    );
  });

  it('delegates one-time disconnect and preserves an absent no-op', async () => {
    const current = setup();
    await expect(
      current.tenantContext.runAsSystemTenant('tenant-a', () =>
        current.service.disconnect(
          'tenant-a',
          'owner-a',
          'credential-disconnect-1',
        ),
      ),
    ).resolves.toEqual({ ok: true, disconnected: true });

    current.disconnect.mockResolvedValue(null);
    await expect(
      current.tenantContext.runAsSystemTenant('tenant-a', () =>
        current.service.disconnect(
          'tenant-a',
          'owner-a',
          'credential-disconnect-2',
        ),
      ),
    ).resolves.toEqual({ ok: true, disconnected: false });
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
});
