import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { P4_10_EXECUTABLE_CAPABILITIES } from '../action-engine';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import type { ConnectCommerceIntegrationDto } from './dto/connect-commerce-integration.dto';
import {
  P410CommerceCredentialExecutableService,
  type P410ExecutionValue,
} from './p4-10-commerce-credential-executable.service';
import {
  P410CommerceCredentialShadowService,
  type P410CredentialMaterial,
  type StoredIntegration,
} from './p4-10-commerce-credential-shadow.service';

const SET_CAPABILITIES = [
  P4_10_EXECUTABLE_CAPABILITIES.connect,
  P4_10_EXECUTABLE_CAPABILITIES.replace,
] as const;
const CREDENTIAL_MANAGER_ROLES = new Set([
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
]);

/**
 * Production transport adapter for the four P4-10 actions.
 *
 * The adapter only classifies the current server-owned transition and resumes
 * a prior logical request. Raw credentials stay in the transient material
 * argument; every durable request fact is produced by the canonical planner.
 */
@Injectable()
export class P410CommerceCredentialCanonicalCutoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly encryption: EncryptionService,
    private readonly planner: P410CommerceCredentialShadowService,
    private readonly executor: P410CommerceCredentialExecutableService,
  ) {}

  async setCredentials(
    tenantId: string,
    actorUserId: string,
    dto: ConnectCommerceIntegrationDto,
    idempotencyKey?: string,
  ): Promise<P410ExecutionValue | null> {
    const scoped = this.tenantContext.assertTenantId(tenantId);
    await this.assertActor(scoped, actorUserId);
    const sourceIntentRef = this.intentRef(idempotencyKey);
    const material = this.material(dto);
    const resumed = await this.resumeExisting(
      scoped,
      actorUserId,
      sourceIntentRef,
      [...SET_CAPABILITIES],
      material,
    );
    if (resumed) return resumed;

    const current = (await this.prisma.commerceIntegration.findUnique({
      where: { tenantId: scoped },
    })) as StoredIntegration | null;
    if (current && this.isSameCredentialSet(current, material)) {
      // A client without an explicit idempotency header may repeat a request
      // after losing the response. The desired authority is already current,
      // so there is no new replacement action or credential write.
      return null;
    }
    const prepared = await this.planner.buildRequest(
      scoped,
      actorUserId,
      {
        sourceIntentRef,
        operation: current ? 'replace' : 'connect',
        ...material,
      },
      'execute',
    );
    return this.executor.execute(prepared.request, prepared.material);
  }

  async recheck(
    tenantId: string,
    actorUserId: string,
    idempotencyKey?: string,
  ): Promise<P410ExecutionValue> {
    const scoped = this.tenantContext.assertTenantId(tenantId);
    await this.assertActor(scoped, actorUserId);
    const sourceIntentRef = this.intentRef(idempotencyKey);
    const resumed = await this.resumeExisting(
      scoped,
      actorUserId,
      sourceIntentRef,
      [P4_10_EXECUTABLE_CAPABILITIES.recheck],
      null,
    );
    if (resumed) return resumed;
    const prepared = await this.planner.buildRequest(
      scoped,
      actorUserId,
      { sourceIntentRef, operation: 'recheck' },
      'execute',
    );
    return this.executor.execute(prepared.request, null);
  }

  async disconnect(
    tenantId: string,
    actorUserId: string,
    idempotencyKey?: string,
  ): Promise<P410ExecutionValue | null> {
    const scoped = this.tenantContext.assertTenantId(tenantId);
    await this.assertActor(scoped, actorUserId);
    const sourceIntentRef = this.intentRef(idempotencyKey);
    const resumed = await this.resumeExisting(
      scoped,
      actorUserId,
      sourceIntentRef,
      [P4_10_EXECUTABLE_CAPABILITIES.disconnect],
      null,
    );
    if (resumed) return resumed;
    const current = await this.prisma.commerceIntegration.findUnique({
      where: { tenantId: scoped },
      select: { id: true },
    });
    if (!current) return null;
    const prepared = await this.planner.buildRequest(
      scoped,
      actorUserId,
      { sourceIntentRef, operation: 'disconnect' },
      'execute',
    );
    return this.executor.execute(prepared.request, null);
  }

  private async resumeExisting(
    tenantId: string,
    actorUserId: string,
    sourceIntentRef: string,
    capabilities: string[],
    material: P410CredentialMaterial | null,
  ): Promise<P410ExecutionValue | undefined> {
    const sourceRef = this.encryption.opaqueReference(
      'p4-10.source-intent',
      sourceIntentRef,
    );
    const existing = await this.prisma.actionExecution.findFirst({
      where: { tenantId, sourceRef, capability: { in: capabilities } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, actorUserId: true },
    });
    if (!existing) return undefined;
    if (existing.actorUserId !== actorUserId) {
      throw new ForbiddenException(
        'The idempotency identity belongs to another actor',
      );
    }
    return this.executor.resume(tenantId, existing.id, material);
  }

  private material(dto: ConnectCommerceIntegrationDto): P410CredentialMaterial {
    const shopId = dto.shopId.trim();
    const secretKey = dto.secretKey.trim();
    if (!shopId || !secretKey) {
      throw new BadRequestException({
        message: 'YooKassa shopId and secret key are required',
        error: { code: 'commerce_credentials_required' },
      });
    }
    return { shopId, secretKey };
  }

  private async assertActor(tenantId: string, actorUserId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId: actorUserId, tenantId } },
      select: { status: true, role: true },
    });
    if (
      !membership ||
      membership.status !== 'active' ||
      !CREDENTIAL_MANAGER_ROLES.has(membership.role)
    ) {
      throw new ForbiddenException(
        'Commerce credential actor is not authorized',
      );
    }
  }

  private isSameCredentialSet(
    current: StoredIntegration,
    desired: P410CredentialMaterial,
  ): boolean {
    if (current.provider !== 'yookassa') {
      throw new ConflictException('Unsupported commerce provider');
    }
    const stored = this.planner.credentialFingerprints(
      this.encryption.decrypt(current.encryptedShopId),
      this.encryption.decrypt(current.encryptedSecretKey),
    );
    return (
      stored.set ===
      this.planner.credentialFingerprints(desired.shopId, desired.secretKey).set
    );
  }

  private intentRef(value?: string): string {
    const normalized =
      value?.trim() || this.tenantContext.get()?.requestId?.trim() || '';
    if (!normalized || normalized.length > 240) {
      throw new BadRequestException(
        'A bounded Idempotency-Key is required for this credential action',
      );
    }
    return normalized;
  }
}
