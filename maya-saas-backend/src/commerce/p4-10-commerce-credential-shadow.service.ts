import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  P4_10_POLICY_VERSION,
  P4_10_REGISTRATIONS,
  P4_10_SAFETY_LIMITS,
  type P410ActionClass,
  type P410Operation,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const CREDENTIAL_MANAGERS = new Set([
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
]);

export type StoredIntegration = {
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
};

export interface P410CredentialMutationInput {
  sourceIntentRef: string;
  operation: P410Operation;
  shopId?: string;
  secretKey?: string;
}

export interface P410CredentialMaterial {
  shopId: string;
  secretKey: string;
}

export interface P410PreparedAction {
  request: TrustedActionExecutionRequestV1;
  material: P410CredentialMaterial | null;
}

export interface P410ShadowResult {
  actionClass: P410ActionClass;
  actionExecutionId: string;
  outcome: 'planned';
  shadowDivergences: 0;
  credentialMutations: 0;
  providerWrites: 0;
  paymentMutations: 0;
  customerValueMutations: 0;
}

export function p410Hash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalJson(value)))
    .digest('base64url');
}

export function p410CommerceStateHash(
  integration: StoredIntegration | null,
  currentCredentialSetFingerprint: string | null,
): string {
  return p410Hash(
    integration
      ? {
          contract: 'p4-10.commerce-integration-state.v1',
          id: integration.id,
          tenantId: integration.tenantId,
          provider: integration.provider,
          status: integration.status,
          currentCredentialSetFingerprint,
          verifiedAt: integration.verifiedAt?.toISOString() ?? null,
          lastCheckedAt: integration.lastCheckedAt?.toISOString() ?? null,
          lastErrorCode: integration.lastErrorCode,
          lastErrorAt: integration.lastErrorAt?.toISOString() ?? null,
        }
      : {
          contract: 'p4-10.commerce-integration-state.v1',
          state: 'absent',
        },
  );
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalJson(nested)]),
    );
  }
  return value;
}

@Injectable()
export class P410CommerceCredentialShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly encryption: EncryptionService,
  ) {}

  async plan(
    tenantId: string,
    actorUserId: string,
    mutation: P410CredentialMutationInput,
  ): Promise<P410ShadowResult> {
    const prepared = await this.buildRequest(
      tenantId,
      actorUserId,
      mutation,
      'shadow',
    );
    const execution = await this.actionEngine.planShadow(prepared.request);
    return {
      actionClass: this.actionClass(mutation.operation),
      actionExecutionId: execution.id,
      outcome: 'planned',
      shadowDivergences: 0,
      credentialMutations: 0,
      providerWrites: 0,
      paymentMutations: 0,
      customerValueMutations: 0,
    };
  }

  async buildRequest(
    tenantId: string,
    actorUserId: string,
    mutation: P410CredentialMutationInput,
    mode: 'shadow' | 'execute',
  ): Promise<P410PreparedAction> {
    const scoped = this.tenantContext.assertTenantId(tenantId);
    const actor = await this.actor(scoped, actorUserId);
    const sourceIntentRef = mutation.sourceIntentRef.trim();
    if (!sourceIntentRef || sourceIntentRef.length > 240) {
      throw new BadRequestException(
        'A bounded server-derived source intent is required',
      );
    }
    const registration = P4_10_REGISTRATIONS.find(
      (candidate) => candidate.operation === mutation.operation,
    );
    if (!registration) {
      throw new BadRequestException('P4-10 operation is not registered');
    }
    const integration = (await this.prisma.commerceIntegration.findUnique({
      where: { tenantId: scoped },
    })) as StoredIntegration | null;
    this.assertTransition(mutation.operation, integration);
    const current = integration
      ? this.credentialFingerprints(
          this.encryption.decrypt(integration.encryptedShopId),
          this.encryption.decrypt(integration.encryptedSecretKey),
        )
      : null;
    const material = this.desiredMaterial(mutation);
    const desired = material
      ? this.credentialFingerprints(material.shopId, material.secretKey)
      : null;
    const integrationId =
      integration?.id ??
      `p410_ci_${this.encryption
        .opaqueReference('p4-10.commerce-integration', `${scoped}:yookassa`)
        .slice(0, 40)}`;
    const expectedStateHash = this.stateHash(integration, current?.set ?? null);
    const actionClass = registration.actionClass;
    const policySnapshotHash = p410Hash({
      contract: P4_10_POLICY_VERSION,
      tenantId: scoped,
      provider: 'yookassa',
      actionClass,
      integrationId,
      expectedStateHash,
      actorMembershipId: actor.id,
      actorRole: actor.role,
      limits: P4_10_SAFETY_LIMITS,
    });
    const input = {
      integrationId,
      provider: 'yookassa',
      expectedStateHash,
      currentCredentialSetFingerprint: current?.set ?? null,
      desiredCredentialSetFingerprint: desired?.set ?? null,
      shopIdFingerprint: desired?.shop ?? null,
      actorMembershipId: actor.id,
      actorRole: actor.role,
      policyVersion: P4_10_POLICY_VERSION,
      policySnapshotHash,
      approvalRequirement: 'AUTHORIZED_ACTOR',
      oneTenantCount: 1,
      oneProviderCount: 1,
      bulkMutation: false,
      providerOperation:
        mutation.operation === 'disconnect'
          ? 'NONE'
          : 'READ_ONLY_CREDENTIAL_VERIFY',
      intendedMutation: `${mutation.operation}_commerce_credentials`,
      credentialWritePerformed: false,
      providerWrites: 0,
    };
    const sourceRef = this.encryption.opaqueReference(
      'p4-10.source-intent',
      sourceIntentRef,
    );
    const identity = p410Hash({
      actionClass,
      integrationId,
      expectedStateHash,
      currentCredentialSetFingerprint: current?.set ?? null,
      desiredCredentialSetFingerprint: desired?.set ?? null,
      sourceRef,
    });
    return {
      request: {
        contract: ACTION_EXECUTION_REQUEST_CONTRACT,
        tenantId: scoped,
        capability:
          mode === 'shadow'
            ? registration.shadowCapability
            : registration.executableCapability,
        source: {
          type:
            mode === 'shadow' ? 'synthetic_shadow' : 'authenticated_request',
          occurrenceScope: `p4-10:${identity}`,
          sourceRef,
          actorUserId,
        },
        targetRef: `commerce-integration:${integrationId}`,
        input,
        evidenceRefs: [`commerce-credential-policy:${policySnapshotHash}`],
        callerIdempotency: {
          scope: `p4-10.${mode}.credential-mutation`,
          key: sourceRef,
        },
      },
      material,
    };
  }

  stateHash(
    integration: StoredIntegration | null,
    currentCredentialSetFingerprint: string | null,
  ): string {
    return p410CommerceStateHash(integration, currentCredentialSetFingerprint);
  }

  credentialFingerprints(shopId: string, secretKey: string) {
    return {
      shop: this.encryption.opaqueReference('p4-10.yookassa-shop-id', shopId),
      set: this.encryption.opaqueReference(
        'p4-10.yookassa-credential-set',
        `${shopId}\u0000${secretKey}`,
      ),
    };
  }

  private desiredMaterial(
    mutation: P410CredentialMutationInput,
  ): P410CredentialMaterial | null {
    if (mutation.operation !== 'connect' && mutation.operation !== 'replace') {
      if (mutation.shopId !== undefined || mutation.secretKey !== undefined) {
        throw new BadRequestException(
          'Raw credentials are not accepted by this operation',
        );
      }
      return null;
    }
    const shopId = mutation.shopId?.trim() ?? '';
    const secretKey = mutation.secretKey?.trim() ?? '';
    if (!shopId || !secretKey) {
      throw new BadRequestException('YooKassa credentials are required');
    }
    return { shopId, secretKey };
  }

  private assertTransition(
    operation: P410Operation,
    integration: StoredIntegration | null,
  ) {
    if (operation === 'connect' && integration) {
      throw new BadRequestException(
        'Existing credentials require the replacement action',
      );
    }
    if (operation !== 'connect' && !integration) {
      throw new NotFoundException(
        'Tenant commerce integration is not configured',
      );
    }
    if (integration && integration.provider !== 'yookassa') {
      throw new BadRequestException('Unsupported commerce provider');
    }
  }

  private async actor(tenantId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { id: true, role: true, status: true },
    });
    if (
      !membership ||
      membership.status !== 'active' ||
      !CREDENTIAL_MANAGERS.has(membership.role)
    ) {
      throw new ForbiddenException(
        'Commerce credential actor is not authorized',
      );
    }
    return membership;
  }

  private actionClass(operation: P410Operation): P410ActionClass {
    const registration = P4_10_REGISTRATIONS.find(
      (candidate) => candidate.operation === operation,
    );
    if (!registration) throw new BadRequestException('Unknown P4-10 action');
    return registration.actionClass;
  }
}
