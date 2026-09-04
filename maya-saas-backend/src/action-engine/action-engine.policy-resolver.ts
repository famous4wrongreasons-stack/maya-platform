import { createHmac, timingSafeEqual } from 'node:crypto';

import { ActionPolicyDecision, type PrismaClient } from '@prisma/client';

import {
  assertConsentChannelBinding,
  type ConsentChannelBinding,
} from '../crm/client-consent-authority';
import { UserRole } from '../common/domain.enums';
import {
  isMayaFeatureKey,
  type MayaFeatureKey,
} from '../common/feature-catalog';
import type {
  EntitlementsService,
  FeatureRequirementDecision,
} from '../entitlements/entitlements.service';
import {
  evaluateTenantAccessState,
  type TenantAccessState,
} from '../tenants/tenant-access-state';
import type { ActionSourceType } from './action-engine.contract';
import { ActionContractError } from './action-engine.errors';
import { stableActionJson } from './action-engine.identity';
import { ActionCapabilityRegistry } from './action-engine.registry';

export const ACTION_POLICY_RESOLUTION_REQUEST_CONTRACT =
  'maya.action-policy-resolution-request/1' as const;
export const ACTION_POLICY_CONTEXT_CONTRACT =
  'maya.action-policy-context/1' as const;

const POLICY_DECIDED_BY = 'canonical_action_policy_resolver' as const;
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ALLOWED_REQUEST_KEYS = new Set([
  'contract',
  'tenantId',
  'capability',
  'sourceType',
  'sourceRef',
  'actorUserId',
  'targetRef',
  'normalizedInputHash',
  'clientChannel',
]);
const PERMITTED_TENANT_ACCESS_STATES = new Set<
  TenantAccessState['accessState']
>(['active', 'trial_active', 'past_due_grace']);
const SUSPENDED_TENANT_RECOVERY_CAPABILITIES = new Set([
  'package5.wave2.reactivate-tenant.shadow.v1',
  'package5.wave2.reactivate-tenant.execute.v1',
]);
const TRUSTED_SERVICE_SOURCE_TYPES = new Set<TrustedServiceSourceType>([
  'agent_task',
  'scheduler',
  'webhook',
  'legacy_bridge',
  'synthetic_shadow',
]);

type TrustedServiceSourceType = Exclude<
  ActionSourceType,
  'authenticated_request'
>;

export interface CanonicalActionPolicyDefinitionV1 {
  capability: string;
  policyProfileKey: string;
  policyProfileVersion: number;
  actorPolicy:
    'REQUIRED' | 'OPTIONAL_TRUSTED_SERVICE' | 'VERIFIED_CLIENT_CHANNEL';
  allowedActorRoles: readonly UserRole[];
  trustedServiceSourceTypes: readonly TrustedServiceSourceType[];
  requiredFeatures: readonly MayaFeatureKey[];
  permissionCodes: readonly string[];
  approverPolicyKey: string;
  validityMs: number;
}

export interface ActionPolicyResolutionRequestV1 {
  contract: typeof ACTION_POLICY_RESOLUTION_REQUEST_CONTRACT;
  /** Resolved from authenticated server context or a bound service source. */
  tenantId: string;
  /** Selected by deterministic server routing, never by model policy output. */
  capability: string;
  sourceType: ActionSourceType;
  /** Durable server-side request, task, job, webhook, or bridge occurrence. */
  sourceRef: string;
  /** Authenticated principal. Omitted only for policy-registered services. */
  actorUserId?: string;
  /** Opaque tenant-qualified target chosen before policy evaluation. */
  targetRef: string;
  /** Produced by the trusted capability normalizer. */
  normalizedInputHash: string;
  clientChannel?: ConsentChannelBinding;
}

export interface CanonicalActionPolicyResolutionV1 {
  policyKey: string;
  policyVersion: number;
  policyDecision: ActionPolicyDecision;
  policyDecidedBy: typeof POLICY_DECIDED_BY;
  autonomyLevel: string;
  approvalRequirement: 'NONE' | 'REQUIRED';
  approverPolicyKey: string;
  riskProfileVersion: number;
  riskFacets: readonly string[];
  reasonCodes: readonly string[];
  policyContextContract: typeof ACTION_POLICY_CONTEXT_CONTRACT;
  policyContextHash: string;
  policyEvidenceJson: Record<string, unknown>;
  policyEvaluatedAt: Date;
  policyValidUntil: Date;
  approvalBindingHash: string;
  approvalBindingExpiresAt: Date;
}

export interface CanonicalActionApprovalAttestationV1 {
  policyContextHash: string;
  policyEvidenceJson: Record<string, unknown>;
  approvalBindingHash: string;
  approvalBindingExpiresAt: Date;
}

export interface CanonicalActionPolicyResolverOptions {
  attestationSecret: string;
  now?: () => Date;
}

type PolicyPrisma = Pick<PrismaClient, 'tenant' | 'membership'> &
  Partial<Pick<PrismaClient, 'clientChannelLink'>>;
type PolicyEntitlements = Pick<
  EntitlementsService,
  'resolveFeatureRequirements'
>;
interface PolicyTenantRecord {
  id: string;
  status: string;
  planId: string | null;
  trialEndsAt: Date | null;
  trialFullAccess: boolean;
  currentPeriodEnd: Date | null;
  pastDueAt: Date | null;
  graceEndsAt: Date | null;
  updatedAt: Date;
}

interface PolicyMembershipRecord {
  id: string;
  userId: string;
  role: string;
  status: string;
  branchId: string | null;
  updatedAt: Date;
  user: { status: string };
}

export class CanonicalActionPolicyRegistry {
  private readonly definitions: Map<string, CanonicalActionPolicyDefinitionV1>;

  constructor(definitions: readonly CanonicalActionPolicyDefinitionV1[]) {
    this.definitions = new Map();
    for (const definition of definitions) {
      this.assertDefinition(definition);
      if (this.definitions.has(definition.capability)) {
        throw new ActionContractError(
          `Duplicate canonical policy profile: ${definition.capability}`,
        );
      }
      this.definitions.set(definition.capability, {
        ...definition,
        allowedActorRoles: [...definition.allowedActorRoles],
        trustedServiceSourceTypes: [...definition.trustedServiceSourceTypes],
        requiredFeatures: [...definition.requiredFeatures],
        permissionCodes: [...definition.permissionCodes],
      });
    }
  }

  get(capability: string): CanonicalActionPolicyDefinitionV1 {
    const definition = this.definitions.get(capability);
    if (!definition) {
      throw new ActionContractError(
        `Canonical policy profile is not registered: ${capability}`,
      );
    }
    return definition;
  }

  private assertDefinition(
    definition: CanonicalActionPolicyDefinitionV1,
  ): void {
    assertCode(definition.capability, 'capability');
    assertCode(definition.policyProfileKey, 'policy profile key');
    assertCode(definition.approverPolicyKey, 'approver policy key');
    if (!Number.isInteger(definition.policyProfileVersion)) {
      throw new ActionContractError(
        'Policy profile version must be a positive integer',
      );
    }
    if (definition.policyProfileVersion < 1) {
      throw new ActionContractError(
        'Policy profile version must be a positive integer',
      );
    }
    if (
      !Number.isInteger(definition.validityMs) ||
      definition.validityMs < 1_000 ||
      definition.validityMs > 15 * 60 * 1_000
    ) {
      throw new ActionContractError(
        'Policy validity must be between one second and fifteen minutes',
      );
    }
    if (
      definition.actorPolicy !== 'REQUIRED' &&
      definition.actorPolicy !== 'OPTIONAL_TRUSTED_SERVICE' &&
      definition.actorPolicy !== 'VERIFIED_CLIENT_CHANNEL'
    ) {
      throw new ActionContractError('Actor policy is not registered');
    }
    if (
      definition.actorPolicy === 'REQUIRED' &&
      definition.trustedServiceSourceTypes.length > 0
    ) {
      throw new ActionContractError(
        'Actor-required policy cannot authorize actorless service sources',
      );
    }
    if (
      new Set(definition.allowedActorRoles).size !==
        definition.allowedActorRoles.length ||
      definition.allowedActorRoles.some(
        (role) => !Object.values(UserRole).includes(role),
      )
    ) {
      throw new ActionContractError('Allowed actor roles must be unique');
    }
    if (
      new Set(definition.trustedServiceSourceTypes).size !==
        definition.trustedServiceSourceTypes.length ||
      definition.trustedServiceSourceTypes.some(
        (sourceType) => !TRUSTED_SERVICE_SOURCE_TYPES.has(sourceType),
      )
    ) {
      throw new ActionContractError(
        'Trusted service source types must be unique',
      );
    }
    if (
      new Set(definition.requiredFeatures).size !==
        definition.requiredFeatures.length ||
      definition.requiredFeatures.some((feature) => !isMayaFeatureKey(feature))
    ) {
      throw new ActionContractError(
        'Required features must be unique registered feature keys',
      );
    }
    if (
      definition.permissionCodes.length === 0 ||
      new Set(definition.permissionCodes).size !==
        definition.permissionCodes.length
    ) {
      throw new ActionContractError(
        'Permission codes must be a non-empty unique set',
      );
    }
    for (const permissionCode of definition.permissionCodes) {
      assertCode(permissionCode, 'permission code');
    }
  }
}

export class CanonicalActionPolicyResolver {
  private readonly secret: Buffer;
  private readonly now: () => Date;

  constructor(
    private readonly prisma: PolicyPrisma,
    private readonly entitlements: PolicyEntitlements,
    options: CanonicalActionPolicyResolverOptions,
    private readonly policyRegistry: CanonicalActionPolicyRegistry,
    private readonly capabilityRegistry = new ActionCapabilityRegistry(),
  ) {
    const secret = options.attestationSecret.trim();
    if (secret.length < 32) {
      throw new ActionContractError(
        'Policy attestation secret must contain at least 32 characters',
      );
    }
    this.secret = Buffer.from(secret, 'utf8');
    this.now = options.now ?? (() => new Date());
  }

  async resolve(
    request: ActionPolicyResolutionRequestV1,
  ): Promise<CanonicalActionPolicyResolutionV1> {
    this.assertRequest(request);
    const capability = this.capabilityRegistry.get(request.capability);
    const policy = this.policyRegistry.get(request.capability);
    if (!capability.allowedSourceTypes.includes(request.sourceType)) {
      throw new ActionContractError(
        'Source type is not allowed by the capability registry',
      );
    }
    if (
      capability.approvalRequirement === 'REQUIRED' &&
      policy.approverPolicyKey === 'none'
    ) {
      throw new ActionContractError(
        'Approval-required capability has no canonical approver policy',
      );
    }
    if (
      capability.approvalRequirement === 'NONE' &&
      policy.approverPolicyKey !== 'none'
    ) {
      throw new ActionContractError(
        'Approval-free capability cannot select an approver policy',
      );
    }

    const evaluatedAt = this.now();
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: request.tenantId },
      select: {
        id: true,
        status: true,
        planId: true,
        trialEndsAt: true,
        trialFullAccess: true,
        currentPeriodEnd: true,
        pastDueAt: true,
        graceEndsAt: true,
        updatedAt: true,
      },
    });
    if (!tenant) {
      throw new ActionContractError('Policy tenant does not exist');
    }

    const membership = request.actorUserId
      ? await this.prisma.membership.findUnique({
          where: {
            userId_tenantId: {
              tenantId: request.tenantId,
              userId: request.actorUserId,
            },
          },
          select: {
            id: true,
            userId: true,
            role: true,
            status: true,
            branchId: true,
            updatedAt: true,
            user: { select: { status: true } },
          },
        })
      : null;
    const entitlementDecision =
      await this.entitlements.resolveFeatureRequirements(
        request.tenantId,
        policy.requiredFeatures,
        evaluatedAt,
      );
    if (entitlementDecision.tenantId !== tenant.id) {
      throw new ActionContractError(
        'Entitlement decision is not bound to the policy tenant',
      );
    }

    const tenantAccess = evaluateTenantAccessState(tenant, evaluatedAt);
    const tenantAllowed =
      PERMITTED_TENANT_ACCESS_STATES.has(tenantAccess.accessState) ||
      (tenant.status === 'suspended' &&
        request.sourceType === 'legacy_bridge' &&
        request.actorUserId === undefined &&
        SUSPENDED_TENANT_RECOVERY_CAPABILITIES.has(request.capability));
    const actorDecision = await this.resolveActorPermission(
      request,
      policy,
      membership,
    );
    const reasonCodes = [
      ...(tenantAllowed ? [] : ['tenant_access_denied']),
      ...actorDecision.reasonCodes,
      ...(entitlementDecision.allowed ? [] : ['entitlement_denied']),
      ...(capability.policyDecision === ActionPolicyDecision.DENY
        ? ['capability_policy_denied']
        : []),
    ].sort();
    const dynamicallyAllowed =
      tenantAllowed && actorDecision.allowed && entitlementDecision.allowed;
    const policyDecision = !dynamicallyAllowed
      ? ActionPolicyDecision.DENY
      : capability.policyDecision;
    const policyValidUntil = this.resolvePolicyValidUntil(
      evaluatedAt,
      policy.validityMs,
      tenantAccess,
      tenant.currentPeriodEnd,
      entitlementDecision,
    );
    const approvalBindingExpiresAt = new Date(
      Math.min(
        policyValidUntil.getTime(),
        capability.approvalRequirement === 'REQUIRED'
          ? evaluatedAt.getTime() +
              (capability.approvalTtlMs ?? policy.validityMs)
          : policyValidUntil.getTime(),
      ),
    );
    const evidence = this.buildEvidence({
      request,
      capability,
      policy,
      tenant,
      tenantAccess,
      tenantAllowed,
      membership,
      actorDecision,
      entitlementDecision,
      evaluatedAt,
      policyValidUntil,
      policyDecision,
      reasonCodes,
      approvalBindingExpiresAt,
    });
    const policyContextHash = this.hmac(
      'maya.action-policy-context/1',
      evidence,
    );
    const approvalBindingHash = this.hmac('maya.action-approval-binding/1', {
      tenantRef: this.refHash('tenant', request.tenantId),
      actorRef: actorDecision.actorRef,
      actorMembershipRef: actorDecision.membershipRef,
      sourceType: request.sourceType,
      sourceRef: this.refHash('source', request.sourceRef),
      capability: capability.capability,
      capabilityVersion: capability.capabilityVersion,
      actionClass: capability.actionClass,
      targetKind: capability.targetKind,
      targetRef: this.refHash('target', request.targetRef),
      normalizedInputHash: request.normalizedInputHash,
      policyKey: capability.policyKey,
      policyVersion: capability.policyVersion,
      policyContextHash,
      riskProfileVersion: capability.riskProfileVersion,
      riskFacets: [...capability.riskFacets].sort(),
      approvalRequirement: capability.approvalRequirement,
      approverPolicyKey: policy.approverPolicyKey,
      approvalBindingExpiresAt: approvalBindingExpiresAt.toISOString(),
    });

    return {
      policyKey: capability.policyKey,
      policyVersion: capability.policyVersion,
      policyDecision,
      policyDecidedBy: POLICY_DECIDED_BY,
      autonomyLevel: capability.autonomyLevel,
      approvalRequirement: capability.approvalRequirement,
      approverPolicyKey: policy.approverPolicyKey,
      riskProfileVersion: capability.riskProfileVersion,
      riskFacets: [...capability.riskFacets],
      reasonCodes,
      policyContextContract: ACTION_POLICY_CONTEXT_CONTRACT,
      policyContextHash,
      policyEvidenceJson: evidence,
      policyEvaluatedAt: evaluatedAt,
      policyValidUntil,
      approvalBindingHash,
      approvalBindingExpiresAt,
    };
  }

  /**
   * Verifies a durable binding without trusting a caller-provided approval
   * flag or hash. The HMAC secret remains owned by this server-side resolver.
   */
  verifyApprovalBinding(
    request: ActionPolicyResolutionRequestV1,
    attestation: CanonicalActionApprovalAttestationV1,
  ): boolean {
    this.assertRequest(request);
    if (
      !HASH_PATTERN.test(attestation.policyContextHash) ||
      !HASH_PATTERN.test(attestation.approvalBindingHash) ||
      !(attestation.approvalBindingExpiresAt instanceof Date) ||
      Number.isNaN(attestation.approvalBindingExpiresAt.getTime()) ||
      !attestation.policyEvidenceJson ||
      Array.isArray(attestation.policyEvidenceJson) ||
      typeof attestation.policyEvidenceJson !== 'object'
    ) {
      return false;
    }
    const actor = recordValue(attestation.policyEvidenceJson.actor);
    const actorRef = nullableHash(actor?.actorRef);
    const membershipRef = nullableHash(actor?.membershipRef);
    if (actorRef === undefined || membershipRef === undefined) {
      return false;
    }
    const expectedContextHash = this.hmac(
      'maya.action-policy-context/1',
      attestation.policyEvidenceJson,
    );
    if (!hashesEqual(expectedContextHash, attestation.policyContextHash)) {
      return false;
    }

    const capability = this.capabilityRegistry.get(request.capability);
    const policy = this.policyRegistry.get(request.capability);
    const expectedBindingHash = this.hmac('maya.action-approval-binding/1', {
      tenantRef: this.refHash('tenant', request.tenantId),
      actorRef,
      actorMembershipRef: membershipRef,
      sourceType: request.sourceType,
      sourceRef: this.refHash('source', request.sourceRef),
      capability: capability.capability,
      capabilityVersion: capability.capabilityVersion,
      actionClass: capability.actionClass,
      targetKind: capability.targetKind,
      targetRef: this.refHash('target', request.targetRef),
      normalizedInputHash: request.normalizedInputHash,
      policyKey: capability.policyKey,
      policyVersion: capability.policyVersion,
      policyContextHash: attestation.policyContextHash,
      riskProfileVersion: capability.riskProfileVersion,
      riskFacets: [...capability.riskFacets].sort(),
      approvalRequirement: capability.approvalRequirement,
      approverPolicyKey: policy.approverPolicyKey,
      approvalBindingExpiresAt:
        attestation.approvalBindingExpiresAt.toISOString(),
    });
    return hashesEqual(expectedBindingHash, attestation.approvalBindingHash);
  }

  private assertRequest(request: ActionPolicyResolutionRequestV1): void {
    if (!request || Array.isArray(request) || typeof request !== 'object') {
      throw new ActionContractError('Policy resolution request is invalid');
    }
    const unexpected = Object.keys(request).filter(
      (key) => !ALLOWED_REQUEST_KEYS.has(key),
    );
    if (unexpected.length > 0) {
      throw new ActionContractError(
        `Policy resolution request contains authority or unknown fields: ${unexpected.sort().join(', ')}`,
      );
    }
    if (request.contract !== ACTION_POLICY_RESOLUTION_REQUEST_CONTRACT) {
      throw new ActionContractError(
        'Policy resolution request contract is invalid',
      );
    }
    assertOpaque(request.tenantId, 'tenantId');
    assertCode(request.capability, 'capability');
    assertCode(request.sourceType, 'sourceType');
    assertOpaque(request.sourceRef, 'sourceRef');
    if (request.actorUserId !== undefined) {
      assertOpaque(request.actorUserId, 'actorUserId');
    }
    assertOpaque(request.targetRef, 'targetRef');
    if (!HASH_PATTERN.test(request.normalizedInputHash)) {
      throw new ActionContractError(
        'normalizedInputHash must be a canonical HMAC',
      );
    }
  }

  private async resolveActorPermission(
    request: ActionPolicyResolutionRequestV1,
    policy: CanonicalActionPolicyDefinitionV1,
    membership: PolicyMembershipRecord | null,
  ): Promise<{
    allowed: boolean;
    reasonCodes: string[];
    principalKind: 'actor' | 'trusted_service' | 'client_channel';
    actorRef: string | null;
    membershipRef: string | null;
    role: string | null;
    branchScopeRef: string | null;
    membershipStatus: string | null;
    userStatus: string | null;
  }> {
    if (policy.actorPolicy === 'VERIFIED_CLIENT_CHANNEL') {
      if (
        !/^package5\.wave3\.record-client-consent\.(?:execute|shadow)\.v1$/.test(
          request.capability,
        ) ||
        !this.prisma.clientChannelLink ||
        !request.clientChannel
      )
        throw new ActionContractError(
          'Exact Client consent policy requires durable channel binding',
        );
      const link = await assertConsentChannelBinding(
        { clientChannelLink: this.prisma.clientChannelLink },
        request.tenantId,
        request.targetRef,
        request.clientChannel,
      );
      return {
        allowed: true,
        reasonCodes: [],
        principalKind: 'client_channel',
        actorRef: this.refHash('client-channel', link.id),
        membershipRef: null,
        role: 'client',
        branchScopeRef: null,
        membershipStatus: null,
        userStatus: null,
      };
    }
    if (request.clientChannel)
      throw new ActionContractError(
        'Client channel authority cannot authorize another capability',
      );
    if (!request.actorUserId) {
      const serviceAllowed =
        policy.actorPolicy === 'OPTIONAL_TRUSTED_SERVICE' &&
        policy.trustedServiceSourceTypes.includes(
          request.sourceType as TrustedServiceSourceType,
        );
      return {
        allowed: serviceAllowed,
        reasonCodes: serviceAllowed ? [] : ['actor_required'],
        principalKind: 'trusted_service',
        actorRef: null,
        membershipRef: null,
        role: null,
        branchScopeRef: null,
        membershipStatus: null,
        userStatus: null,
      };
    }

    const membershipActive = membership?.status === 'active';
    const userActive = membership?.user.status === 'active';
    const roleAllowed = Boolean(
      membership &&
      policy.allowedActorRoles.includes(membership.role as UserRole),
    );
    const reasonCodes = [
      ...(membership ? [] : ['membership_missing']),
      ...(membership && !membershipActive ? ['membership_inactive'] : []),
      ...(membership && !userActive ? ['user_inactive'] : []),
      ...(membership && !roleAllowed ? ['role_denied'] : []),
    ];

    return {
      allowed:
        Boolean(membership) && membershipActive && userActive && roleAllowed,
      reasonCodes,
      principalKind: 'actor',
      actorRef: this.refHash('actor', request.actorUserId),
      membershipRef: membership
        ? this.refHash('membership', membership.id)
        : null,
      role: membership?.role ?? null,
      branchScopeRef: membership?.branchId
        ? this.refHash('branch', membership.branchId)
        : null,
      membershipStatus: membership?.status ?? null,
      userStatus: membership?.user.status ?? null,
    };
  }

  private resolvePolicyValidUntil(
    evaluatedAt: Date,
    validityMs: number,
    tenantAccess: TenantAccessState,
    currentPeriodEnd: Date | null,
    entitlements: FeatureRequirementDecision,
  ): Date {
    const candidates = [new Date(evaluatedAt.getTime() + validityMs)];
    for (const candidate of [
      currentPeriodEnd,
      tenantAccess.trialEndsAt,
      tenantAccess.graceEndsAt,
      entitlements.validUntil,
    ]) {
      if (candidate && candidate.getTime() > evaluatedAt.getTime()) {
        candidates.push(candidate);
      }
    }
    return candidates.sort(
      (left, right) => left.getTime() - right.getTime(),
    )[0];
  }

  private buildEvidence(input: {
    request: ActionPolicyResolutionRequestV1;
    capability: ReturnType<ActionCapabilityRegistry['get']>;
    policy: CanonicalActionPolicyDefinitionV1;
    tenant: PolicyTenantRecord;
    tenantAccess: TenantAccessState;
    tenantAllowed: boolean;
    membership: PolicyMembershipRecord | null;
    actorDecision: Awaited<
      ReturnType<CanonicalActionPolicyResolver['resolveActorPermission']>
    >;
    entitlementDecision: FeatureRequirementDecision;
    evaluatedAt: Date;
    policyValidUntil: Date;
    policyDecision: ActionPolicyDecision;
    reasonCodes: string[];
    approvalBindingExpiresAt: Date;
  }): Record<string, unknown> {
    return {
      contract: ACTION_POLICY_CONTEXT_CONTRACT,
      tenant: {
        ref: this.refHash('tenant', input.tenant.id),
        status: input.tenantAccess.tenantStatus,
        accessState: input.tenantAccess.accessState,
        allowed: input.tenantAllowed,
        updatedAt: input.tenant.updatedAt.toISOString(),
      },
      source: {
        type: input.request.sourceType,
        ref: this.refHash('source', input.request.sourceRef),
      },
      actor: {
        kind: input.actorDecision.principalKind,
        actorRef: input.actorDecision.actorRef,
        membershipRef: input.actorDecision.membershipRef,
        membershipStatus: input.actorDecision.membershipStatus,
        userStatus: input.actorDecision.userStatus,
        role: input.actorDecision.role,
        branchScopeRef: input.actorDecision.branchScopeRef,
        membershipUpdatedAt: input.membership?.updatedAt.toISOString() ?? null,
      },
      capability: {
        key: input.capability.capability,
        version: input.capability.capabilityVersion,
        actionClass: input.capability.actionClass,
        targetKind: input.capability.targetKind,
      },
      target: {
        kind: input.capability.targetKind,
        ref: this.refHash('target', input.request.targetRef),
      },
      normalizedInputHash: input.request.normalizedInputHash,
      risk: {
        profileVersion: input.capability.riskProfileVersion,
        facets: [...input.capability.riskFacets].sort(),
      },
      permission: {
        profileKey: input.policy.policyProfileKey,
        profileVersion: input.policy.policyProfileVersion,
        codes: [...input.policy.permissionCodes].sort(),
        actorPolicy: input.policy.actorPolicy,
        allowed: input.actorDecision.allowed,
      },
      entitlement: {
        contract: input.entitlementDecision.contract,
        planRef: input.entitlementDecision.planId
          ? this.refHash('plan', input.entitlementDecision.planId)
          : null,
        requirements: input.entitlementDecision.requiredFeatures,
        allowed: input.entitlementDecision.allowed,
        validUntil: input.entitlementDecision.validUntil?.toISOString() ?? null,
      },
      autonomy: {
        source: 'action_capability_registry',
        level: input.capability.autonomyLevel,
      },
      approval: {
        requirement: input.capability.approvalRequirement,
        approverPolicyKey: input.policy.approverPolicyKey,
        bindingExpiresAt: input.approvalBindingExpiresAt.toISOString(),
      },
      policy: {
        key: input.capability.policyKey,
        version: input.capability.policyVersion,
        decision: input.policyDecision,
        decidedBy: POLICY_DECIDED_BY,
        reasonCodes: input.reasonCodes,
      },
      evaluatedAt: input.evaluatedAt.toISOString(),
      validUntil: input.policyValidUntil.toISOString(),
    };
  }

  private refHash(kind: string, value: string): string {
    return this.hmac('maya.action-policy-reference/1', { kind, value });
  }

  private hmac(namespace: string, value: unknown): string {
    return createHmac('sha256', this.secret)
      .update(namespace)
      .update('\u0000')
      .update(stableActionJson(value))
      .digest('hex');
  }
}

function assertCode(value: string, label: string): void {
  if (!CODE_PATTERN.test(value)) {
    throw new ActionContractError(`${label} must be a stable code`);
  }
}

function assertOpaque(value: string, label: string): void {
  if (typeof value !== 'string') {
    throw new ActionContractError(`${label} must be an opaque reference`);
  }
  const containsControlCharacter = [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (
    value.trim() !== value ||
    value.length === 0 ||
    value.length > 240 ||
    containsControlCharacter
  ) {
    throw new ActionContractError(`${label} must be an opaque reference`);
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && !Array.isArray(value) && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function nullableHash(value: unknown): string | null | undefined {
  return value === null
    ? null
    : typeof value === 'string' && HASH_PATTERN.test(value)
      ? value
      : undefined;
}

function hashesEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
