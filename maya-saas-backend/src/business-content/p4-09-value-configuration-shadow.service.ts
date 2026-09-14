import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  TenantCatalogItem,
  TenantCatalogItemValueVersion,
} from '@prisma/client';

import {
  ACTION_EXECUTION_REQUEST_CONTRACT,
  ActionEngineRuntimeService,
  P4_09_EXECUTABLE_CAPABILITIES,
  P4_09_POLICY_VERSION,
  P4_09_REGISTRATIONS,
  P4_09_SAFETY_LIMITS,
  P4_09_SHADOW_CAPABILITIES,
  type P409ActionClass,
  type P409OfferKind,
  type TrustedActionExecutionRequestV1,
} from '../action-engine';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

const REQUESTER_ROLES = new Set([
  'tenant_owner',
  'business_owner',
  'tenant_admin',
  'administrator',
]);

export type P409CapabilityMode = 'shadow' | 'execute';

export interface P409OfferMutationInput {
  sourceIntentRef: string;
  kind: P409OfferKind;
  operation: 'create' | 'update' | 'delete';
  templateKey?: string;
  offerId?: string;
  name?: string;
  description?: string | null;
  priceKopecks?: number;
  currency?: string;
  active?: boolean;
  externalRef?: string | null;
}

export interface P409ReferralPolicyInput {
  sourceIntentRef: string;
  enabled?: boolean;
  inviterRewardKopecks?: number | null;
  inviteeRewardKopecks?: number | null;
  inviterRewardPercentBasisPoints?: number | null;
  inviteeRewardPercentBasisPoints?: number | null;
  inviterRewardLiabilityCapKopecks?: number | null;
  inviteeRewardLiabilityCapKopecks?: number | null;
  currency?: string;
  terms?: string | null;
  codePrefix?: string | null;
}

export interface P409ShadowResult {
  actionClass: P409ActionClass;
  actionExecutionId: string;
  outcome: 'planned';
  shadowDivergences: 0;
  configurationMutations: 0;
  valueMutations: 0;
  providerWrites: 0;
}

type OfferWithVersion = TenantCatalogItem & {
  currentValueVersion: TenantCatalogItemValueVersion | null;
  replacementOffer?: TenantCatalogItem | null;
};

export function p409Hash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalJson(value)))
    .digest('base64url');
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
export class P409ValueConfigurationShadowService {
  constructor(
    private readonly actionEngine: ActionEngineRuntimeService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async planOffer(
    tenantId: string,
    actorUserId: string,
    mutation: P409OfferMutationInput,
  ): Promise<P409ShadowResult> {
    const request = await this.buildOfferRequest(
      tenantId,
      actorUserId,
      mutation,
      'shadow',
    );
    const execution = await this.actionEngine.planShadow(request);
    return this.shadowResult(
      this.actionFor(mutation.kind, mutation.operation),
      execution.id,
    );
  }

  async planReferralPolicy(
    tenantId: string,
    actorUserId: string,
    mutation: P409ReferralPolicyInput,
  ): Promise<P409ShadowResult> {
    const request = await this.buildReferralPolicyRequest(
      tenantId,
      actorUserId,
      mutation,
      'shadow',
    );
    const execution = await this.actionEngine.planShadow(request);
    return this.shadowResult('update_referral_reward_policy', execution.id);
  }

  async buildOfferRequest(
    tenantId: string,
    actorUserId: string,
    mutation: P409OfferMutationInput,
    mode: P409CapabilityMode,
  ): Promise<TrustedActionExecutionRequestV1> {
    const scoped = this.tenantContext.assertTenantId(tenantId);
    const actor = await this.actor(scoped, actorUserId);
    this.sourceIntent(mutation.sourceIntentRef);
    const actionClass = this.actionFor(mutation.kind, mutation.operation);
    const registration = P4_09_REGISTRATIONS.find(
      (candidate) => candidate.actionClass === actionClass,
    );
    if (!registration) {
      throw new BadRequestException('P4-09 action is not registered');
    }

    const state =
      mutation.operation === 'create'
        ? await this.createOfferState(scoped, mutation)
        : await this.existingOfferState(scoped, mutation);
    const desired = this.desiredOffer(mutation, state.offer);
    const valueSnapshotHash = p409Hash({
      contract: 'p4-09.offer-value-snapshot.v1',
      tenantId: scoped,
      offerId: state.offerId,
      kind: mutation.kind,
      templateKey: state.templateKey,
      priceKopecks: desired.priceKopecks,
      currency: desired.currency,
      availabilityState: desired.availabilityState,
    });

    const repeat =
      state.offer?.currentValueVersion?.valueSnapshotHash === valueSnapshotHash;
    const previousVersionId = repeat
      ? state.offer!.currentValueVersion!.previousVersionId
      : (state.offer?.currentValueVersion?.id ?? null);
    const nextVersion = repeat
      ? state.offer!.currentValueVersion!.version
      : (state.offer?.currentValueVersion?.version ?? 0) + 1;
    const versionId = repeat
      ? state.offer!.currentValueVersion!.id
      : `p409_ver_${p409Hash([
          scoped,
          state.offerId,
          previousVersionId ?? 'initial',
          valueSnapshotHash,
        ]).slice(0, 40)}`;
    const input = {
      offerId: state.offerId,
      offerKind: mutation.kind,
      templateKey: state.templateKey,
      supersedesOfferId: state.supersedesOfferId,
      previousVersionId,
      nextVersion,
      versionId,
      name: desired.name,
      description: desired.description,
      priceKopecks: desired.priceKopecks,
      currency: desired.currency,
      availabilityState: desired.availabilityState,
      externalRef: desired.externalRef,
      valueSnapshotHash,
      actorMembershipId: actor.id,
      actorRole: actor.role,
      policyVersion: P4_09_POLICY_VERSION,
      policySnapshotHash: p409Hash({
        policy: P4_09_POLICY_VERSION,
        tenantId: scoped,
        actionClass,
        target: state.offerId,
        versionId,
        valueSnapshotHash,
        requesterMembershipId: actor.id,
        ownerApproval: 'required',
        caps: P4_09_SAFETY_LIMITS,
      }),
      ownerApprovalRequired: true,
      oneTargetCount: 1,
      bulkMutation: false,
      intendedMutation: `${mutation.operation}_immutable_${mutation.kind}_offer_value_version`,
      configWritePerformed: false,
      providerWrites: 0,
    };
    return this.request({
      tenantId: scoped,
      actorUserId,
      sourceIntentRef: mutation.sourceIntentRef,
      capability:
        mode === 'shadow'
          ? registration.shadowCapability
          : registration.executableCapability,
      targetRef: `tenant-catalog-item:${state.offerId}`,
      identity: p409Hash({ actionClass, target: state.offerId, versionId }),
      input,
    });
  }

  async buildReferralPolicyRequest(
    tenantId: string,
    actorUserId: string,
    mutation: P409ReferralPolicyInput,
    mode: P409CapabilityMode,
  ): Promise<TrustedActionExecutionRequestV1> {
    const scoped = this.tenantContext.assertTenantId(tenantId);
    const actor = await this.actor(scoped, actorUserId);
    this.sourceIntent(mutation.sourceIntentRef);
    const existing = await this.prisma.referralProgram.findUnique({
      where: { tenantId: scoped },
      include: { currentValueVersion: true },
    });
    const programId =
      existing?.id ??
      `p409_ref_${p409Hash([scoped, 'referral-program']).slice(0, 40)}`;
    const desired = {
      enabled: mutation.enabled ?? existing?.enabled ?? false,
      inviterRewardKopecks:
        mutation.inviterRewardKopecks === undefined
          ? (existing?.inviterRewardKopecks ?? null)
          : mutation.inviterRewardKopecks,
      inviteeRewardKopecks:
        mutation.inviteeRewardKopecks === undefined
          ? (existing?.inviteeRewardKopecks ?? null)
          : mutation.inviteeRewardKopecks,
      inviterRewardPercentBasisPoints:
        mutation.inviterRewardPercentBasisPoints === undefined
          ? (existing?.inviterRewardPercentBasisPoints ?? null)
          : mutation.inviterRewardPercentBasisPoints,
      inviteeRewardPercentBasisPoints:
        mutation.inviteeRewardPercentBasisPoints === undefined
          ? (existing?.inviteeRewardPercentBasisPoints ?? null)
          : mutation.inviteeRewardPercentBasisPoints,
      inviterRewardLiabilityCapKopecks:
        mutation.inviterRewardLiabilityCapKopecks === undefined
          ? (existing?.inviterRewardLiabilityCapKopecks ?? null)
          : mutation.inviterRewardLiabilityCapKopecks,
      inviteeRewardLiabilityCapKopecks:
        mutation.inviteeRewardLiabilityCapKopecks === undefined
          ? (existing?.inviteeRewardLiabilityCapKopecks ?? null)
          : mutation.inviteeRewardLiabilityCapKopecks,
      currency: (
        mutation.currency ??
        existing?.currency ??
        'RUB'
      ).toUpperCase(),
      terms:
        mutation.terms === undefined
          ? (existing?.terms ?? null)
          : mutation.terms,
      codePrefix:
        mutation.codePrefix === undefined
          ? (existing?.codePrefix ?? null)
          : mutation.codePrefix,
    };
    const valueSnapshotHash = p409Hash({
      contract: 'p4-09.referral-policy-value-snapshot.v1',
      tenantId: scoped,
      programId,
      ...desired,
    });
    const currentVersion = existing?.currentValueVersion ?? null;
    const repeat = currentVersion?.valueSnapshotHash === valueSnapshotHash;
    const previousVersionId = repeat
      ? currentVersion.previousVersionId
      : (currentVersion?.id ?? null);
    const nextVersion = repeat
      ? currentVersion.version
      : (currentVersion?.version ?? 0) + 1;
    const versionId = repeat
      ? currentVersion.id
      : `p409_refver_${p409Hash([
          scoped,
          programId,
          previousVersionId ?? 'initial',
          valueSnapshotHash,
        ]).slice(0, 36)}`;
    const input = {
      programId,
      previousVersionId,
      nextVersion,
      versionId,
      ...desired,
      valueSnapshotHash,
      actorMembershipId: actor.id,
      actorRole: actor.role,
      policyVersion: P4_09_POLICY_VERSION,
      policySnapshotHash: p409Hash({
        policy: P4_09_POLICY_VERSION,
        tenantId: scoped,
        target: programId,
        versionId,
        valueSnapshotHash,
        requesterMembershipId: actor.id,
        ownerApproval: 'required',
        caps: P4_09_SAFETY_LIMITS,
      }),
      ownerApprovalRequired: true,
      oneTargetCount: 1,
      bulkMutation: false,
      intendedMutation: 'append_referral_reward_policy_version',
      configWritePerformed: false,
      providerWrites: 0,
    };
    return this.request({
      tenantId: scoped,
      actorUserId,
      sourceIntentRef: mutation.sourceIntentRef,
      capability:
        mode === 'shadow'
          ? P4_09_SHADOW_CAPABILITIES.updateReferral
          : P4_09_EXECUTABLE_CAPABILITIES.updateReferral,
      targetRef: `referral-program:${programId}`,
      identity: p409Hash({
        actionClass: 'update_referral_reward_policy',
        target: programId,
        versionId,
      }),
      input,
    });
  }

  private async createOfferState(
    tenantId: string,
    mutation: P409OfferMutationInput,
  ) {
    if (!mutation.templateKey) {
      throw new BadRequestException('A canonical offer template is required');
    }
    const offers = (await this.prisma.tenantCatalogItem.findMany({
      where: {
        tenantId,
        kind: mutation.kind,
        canonicalTemplateKey: mutation.templateKey,
      },
      include: { currentValueVersion: true, replacementOffer: true },
      orderBy: { createdAt: 'asc' },
    })) as OfferWithVersion[];
    const live = offers.filter(
      (offer) => offer.currentValueVersion?.availabilityState !== 'RETIRED',
    );
    if (live.length > 1) {
      throw new BadRequestException('Canonical offer authority is ambiguous');
    }
    if (live.length === 1) {
      return {
        offer: live[0],
        offerId: live[0].id,
        templateKey: mutation.templateKey,
        supersedesOfferId: live[0].supersedesOfferId,
      };
    }
    const predecessor = offers.filter(
      (offer) =>
        offer.currentValueVersion?.availabilityState === 'RETIRED' &&
        !offer.replacementOffer,
    );
    if (predecessor.length > 1) {
      throw new BadRequestException('Replacement lineage is ambiguous');
    }
    const supersedesOfferId = predecessor[0]?.id ?? null;
    return {
      offer: null,
      offerId: `p409_offer_${p409Hash([
        tenantId,
        mutation.kind,
        mutation.templateKey,
        supersedesOfferId ?? 'root',
      ]).slice(0, 36)}`,
      templateKey: mutation.templateKey,
      supersedesOfferId,
    };
  }

  private async existingOfferState(
    tenantId: string,
    mutation: P409OfferMutationInput,
  ) {
    if (!mutation.offerId) {
      throw new BadRequestException(
        'An immutable internal offer id is required',
      );
    }
    const offer = await this.prisma.tenantCatalogItem.findFirst({
      where: { id: mutation.offerId, tenantId, kind: mutation.kind },
      include: { currentValueVersion: true },
    });
    if (!offer) throw new NotFoundException('Canonical offer does not exist');
    if (!offer.canonicalTemplateKey || !offer.currentValueVersion) {
      throw new BadRequestException(
        'Historical offer is not a canonical versioned authority',
      );
    }
    if (
      offer.currentValueVersion.availabilityState === 'RETIRED' &&
      mutation.operation !== 'delete'
    ) {
      throw new BadRequestException('Retired offer cannot be mutated');
    }
    return {
      offer,
      offerId: offer.id,
      templateKey: offer.canonicalTemplateKey,
      supersedesOfferId: offer.supersedesOfferId,
    };
  }

  private desiredOffer(
    mutation: P409OfferMutationInput,
    existing: OfferWithVersion | null,
  ) {
    const priceKopecks = mutation.priceKopecks ?? existing?.priceKopecks;
    const name = mutation.name?.trim() || existing?.name;
    if (priceKopecks === undefined || !name) {
      throw new BadRequestException('Exact offer value and name are required');
    }
    return {
      name,
      description:
        mutation.description === undefined
          ? (existing?.description ?? null)
          : mutation.description?.trim() || null,
      priceKopecks,
      currency: (
        mutation.currency ??
        existing?.currency ??
        'RUB'
      ).toUpperCase(),
      availabilityState:
        mutation.operation === 'delete'
          ? 'RETIRED'
          : mutation.active === false
            ? 'INACTIVE'
            : mutation.active === true
              ? 'ACTIVE'
              : existing?.active === false
                ? 'INACTIVE'
                : 'ACTIVE',
      externalRef:
        mutation.externalRef === undefined
          ? (existing?.externalRef ?? null)
          : mutation.externalRef?.trim() || null,
    };
  }

  private actionFor(
    kind: P409OfferKind,
    operation: 'create' | 'update' | 'delete',
  ): P409ActionClass {
    return kind === 'certificate'
      ? (`${operation}_gift_certificate_offer` as P409ActionClass)
      : (`${operation}_customer_membership_offer` as P409ActionClass);
  }

  private async actor(tenantId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { id: true, role: true, status: true },
    });
    if (
      !membership ||
      membership.status !== 'active' ||
      !REQUESTER_ROLES.has(membership.role)
    ) {
      throw new ForbiddenException(
        'Value configuration actor is not authorized',
      );
    }
    return membership;
  }

  private request(input: {
    tenantId: string;
    actorUserId: string;
    sourceIntentRef: string;
    capability: string;
    targetRef: string;
    identity: string;
    input: Record<string, unknown>;
  }): TrustedActionExecutionRequestV1 {
    return {
      contract: ACTION_EXECUTION_REQUEST_CONTRACT,
      tenantId: input.tenantId,
      capability: input.capability,
      source: {
        type: 'authenticated_request',
        occurrenceScope: `p4-09:${input.identity}`,
        sourceRef: input.sourceIntentRef,
        actorUserId: input.actorUserId,
      },
      targetRef: input.targetRef,
      input: input.input,
      evidenceRefs: [
        `p4-09-policy:${String(input.input.policySnapshotHash)}`,
        `p4-09-version:${String(input.input.versionId)}`,
      ],
      callerIdempotency: {
        scope: `p4-09.${input.capability}`,
        key: input.identity,
      },
    };
  }

  private sourceIntent(value: string): string {
    const normalized = value?.trim();
    if (!normalized || normalized.length > 240) {
      throw new BadRequestException(
        'A stable source intent reference is required',
      );
    }
    return normalized;
  }

  private shadowResult(
    actionClass: P409ActionClass,
    actionExecutionId: string,
  ): P409ShadowResult {
    return {
      actionClass,
      actionExecutionId,
      outcome: 'planned',
      shadowDivergences: 0,
      configurationMutations: 0,
      valueMutations: 0,
      providerWrites: 0,
    };
  }
}
