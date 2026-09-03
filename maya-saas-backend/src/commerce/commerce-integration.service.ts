import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';

import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { ConnectCommerceIntegrationDto } from './dto/connect-commerce-integration.dto';
import { P410CommerceCredentialCanonicalCutoverService } from './p4-10-commerce-credential-canonical-cutover.service';
import { P410CommerceCredentialExecutionError } from './p4-10-commerce-credential-executable.service';

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
    private readonly canonicalCutover: P410CommerceCredentialCanonicalCutoverService,
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

  async connect(
    tenantId: string,
    actorUserId: string,
    dto: ConnectCommerceIntegrationDto,
    idempotencyKey?: string,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    try {
      await this.canonicalCutover.setCredentials(
        scopedTenantId,
        actorUserId,
        dto,
        idempotencyKey,
      );
    } catch (error) {
      this.mapCanonicalError(error);
    }
    return this.getStatus(scopedTenantId);
  }

  async recheck(
    tenantId: string,
    actorUserId: string,
    idempotencyKey?: string,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    let errorCode: string | null = null;
    try {
      const result = await this.canonicalCutover.recheck(
        scopedTenantId,
        actorUserId,
        idempotencyKey,
      );
      errorCode = result.verificationErrorCode;
    } catch (error) {
      this.mapCanonicalError(error);
    }
    if (errorCode) this.throwProviderError(errorCode);
    return this.getStatus(scopedTenantId);
  }

  async disconnect(
    tenantId: string,
    actorUserId: string,
    idempotencyKey?: string,
  ) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    try {
      const result = await this.canonicalCutover.disconnect(
        scopedTenantId,
        actorUserId,
        idempotencyKey,
      );
      return { ok: true, disconnected: Boolean(result) };
    } catch (error) {
      this.mapCanonicalError(error);
    }
    return { ok: true, disconnected: false };
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

  private mapCanonicalError(error: unknown): never {
    if (!(error instanceof P410CommerceCredentialExecutionError)) throw error;
    this.throwProviderError(error.message);
  }

  private throwProviderError(code: string): never {
    if (code === 'commerce_credentials_rejected') {
      throw new BadRequestException({
        message: 'YooKassa rejected the supplied credentials',
        error: { code },
      });
    }
    throw new BadGatewayException({
      message:
        code === 'commerce_provider_unavailable'
          ? 'Could not reach YooKassa'
          : 'YooKassa credential check failed',
      error: { code },
    });
  }
}
