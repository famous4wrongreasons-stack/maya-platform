import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ConnectCommerceIntegrationDto } from './dto/connect-commerce-integration.dto';

type StoredCommerceIntegration = {
  id: string;
  tenantId: string;
  provider: string;
  encryptedShopId: string;
  encryptedSecretKey: string;
  status: string;
  verifiedAt: Date | null;
  lastCheckedAt: Date | null;
  lastErrorCode: string | null;
  lastErrorAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class CommerceIntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly tenantContext: TenantContextService,
    private readonly configService: ConfigService,
  ) {}

  async getStatus(tenantId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const integration = await this.prisma.commerceIntegration.findUnique({
      where: { tenantId: scopedTenantId },
    });

    if (!integration) {
      return {
        configured: false,
        provider: 'yookassa',
        connection: null,
      };
    }

    return {
      configured: true,
      provider: integration.provider,
      connection: this.serialize(integration),
    };
  }

  async connect(tenantId: string, dto: ConnectCommerceIntegrationDto) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const shopId = dto.shopId.trim();
    const secretKey = dto.secretKey.trim();

    if (!shopId || !secretKey) {
      throw new BadRequestException({
        message: 'YooKassa shopId and secret key are required',
        error: { code: 'commerce_credentials_required' },
      });
    }

    await this.verifyCredentials(shopId, secretKey);
    const checkedAt = new Date();
    const encryptedShopId = this.encryptionService.encrypt(shopId);
    const encryptedSecretKey = this.encryptionService.encrypt(secretKey);
    const integration = await this.prisma.commerceIntegration.upsert({
      where: { tenantId: scopedTenantId },
      create: {
        tenantId: scopedTenantId,
        provider: 'yookassa',
        encryptedShopId,
        encryptedSecretKey,
        status: 'active',
        verifiedAt: checkedAt,
        lastCheckedAt: checkedAt,
      },
      update: {
        provider: 'yookassa',
        encryptedShopId,
        encryptedSecretKey,
        status: 'active',
        verifiedAt: checkedAt,
        lastCheckedAt: checkedAt,
        lastErrorCode: null,
        lastErrorAt: null,
      },
    });

    return {
      configured: true,
      provider: integration.provider,
      connection: this.serialize(integration),
    };
  }

  async recheck(tenantId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const integration = await this.getStored(scopedTenantId);
    const checkedAt = new Date();

    try {
      await this.verifyCredentials(
        this.encryptionService.decrypt(integration.encryptedShopId),
        this.encryptionService.decrypt(integration.encryptedSecretKey),
      );
      const updated = await this.prisma.commerceIntegration.update({
        where: { tenantId: scopedTenantId },
        data: {
          status: 'active',
          verifiedAt: checkedAt,
          lastCheckedAt: checkedAt,
          lastErrorCode: null,
          lastErrorAt: null,
        },
      });
      return {
        configured: true,
        provider: updated.provider,
        connection: this.serialize(updated),
      };
    } catch (error) {
      const errorCode = this.errorCode(error);
      await this.prisma.commerceIntegration.update({
        where: { tenantId: scopedTenantId },
        data: {
          status: 'error',
          lastCheckedAt: checkedAt,
          lastErrorCode: errorCode,
          lastErrorAt: checkedAt,
        },
      });
      throw error;
    }
  }

  async disconnect(tenantId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const existing = await this.prisma.commerceIntegration.findUnique({
      where: { tenantId: scopedTenantId },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.commerceIntegration.delete({
        where: { tenantId: scopedTenantId },
      });
    }
    return { ok: true, disconnected: Boolean(existing) };
  }

  private async getStored(
    tenantId: string,
  ): Promise<StoredCommerceIntegration> {
    const integration = await this.prisma.commerceIntegration.findUnique({
      where: { tenantId },
    });
    if (!integration) {
      throw new NotFoundException({
        message: 'Tenant commerce integration is not configured',
        error: { code: 'commerce_integration_not_configured' },
      });
    }
    return integration;
  }

  private async verifyCredentials(shopId: string, secretKey: string) {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl()}/payments?limit=1`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(this.timeoutMs()),
      });
    } catch {
      throw new BadGatewayException({
        message: 'Could not reach YooKassa',
        error: { code: 'commerce_provider_unavailable' },
      });
    }

    if (response.status === 401 || response.status === 403) {
      throw new BadRequestException({
        message: 'YooKassa rejected the supplied credentials',
        error: { code: 'commerce_credentials_rejected' },
      });
    }
    if (!response.ok) {
      throw new BadGatewayException({
        message: 'YooKassa credential check failed',
        error: {
          code: 'commerce_provider_error',
          provider_status: response.status,
        },
      });
    }
  }

  private serialize(integration: StoredCommerceIntegration) {
    const shopId = this.encryptionService.decrypt(integration.encryptedShopId);
    return {
      id: integration.id,
      tenant_id: integration.tenantId,
      provider: integration.provider,
      status: integration.status,
      has_credentials: true,
      shop_id_masked: this.maskShopId(shopId),
      verified: Boolean(integration.verifiedAt),
      verified_at: integration.verifiedAt,
      last_checked_at: integration.lastCheckedAt,
      last_error_code: integration.lastErrorCode,
      last_error_at: integration.lastErrorAt,
      created_at: integration.createdAt,
      updated_at: integration.updatedAt,
    };
  }

  private maskShopId(value: string): string {
    if (value.length <= 4) return '*'.repeat(value.length);
    return `${value.slice(0, 2)}${'*'.repeat(Math.min(8, value.length - 4))}${value.slice(-2)}`;
  }

  private baseUrl(): string {
    return (
      this.configService.get<string>('YOOKASSA_API_BASE_URL')?.trim() ||
      'https://api.yookassa.ru/v3'
    ).replace(/\/+$/, '');
  }

  private timeoutMs(): number {
    const value = Number(
      this.configService.get<string>('YOOKASSA_REQUEST_TIMEOUT_MS'),
    );
    return Number.isFinite(value) && value >= 1000 && value <= 60_000
      ? value
      : 15_000;
  }

  private errorCode(error: unknown): string {
    if (!error || typeof error !== 'object') return 'commerce_provider_error';
    const response = (error as { getResponse?: () => unknown }).getResponse?.();
    if (!response || typeof response !== 'object') {
      return 'commerce_provider_error';
    }
    const nested = (response as { error?: { code?: unknown } }).error;
    return typeof nested?.code === 'string'
      ? nested.code
      : 'commerce_provider_error';
  }
}
